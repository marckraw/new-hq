import { logger, userLogger } from "@/utils/logger";
import {
  Agent,
  AgentResponse,
  validateAgentActResponse,
} from "../../factories/agents.factory.types";
import { ChatMessage } from "../../../routes/api/shared";
import { serviceRegistry } from "../../../registry/service-registry";
import { agentFactory } from "../../factories/agents.factory";
import { mcpServersFactory } from "../../../domains/integration/factories/mcp-servers.factory";
import { agentExecutionService } from "../AgentExecutionService/agent-execution.service";
import type { ProgressMessage } from "core.mrck.dev";
import { transformMessagesForAI } from "../../../routes/api/shared";
import {
  AgentFlowContext,
  AgentFlowOptions,
  FlowStepResult,
  ToolExecutionResult,
} from "../../../schemas/agent-flow.schemas";
import { unifiedToolsRegistry } from "../../tools/unified/unified-tools.registry";

// Types are now imported from schemas/conversation.schemas.ts
// Using Zod-inferred types for better type safety and validation

const createAgentFlowService = () => {
  // Global send function that can be set by the main API route
  let globalSendFunction: ((data: ProgressMessage) => Promise<void>) | null =
    null;

  /**
   * Set the global send function for streaming updates
   */
  const setSendFunction = (
    sendFn: (data: ProgressMessage) => Promise<void>
  ) => {
    globalSendFunction = sendFn;
  };

  /**
   * Clear the global send function
   */
  const clearSendFunction = () => {
    globalSendFunction = null;
  };

  /**
   * Send a progress update using the global send function and save to database
   */
  const sendUpdate = async (
    data: ProgressMessage,
    context?: AgentFlowContext
  ): Promise<void> => {
    if (globalSendFunction) {
      await globalSendFunction(data);
    } else {
      // Fallback: just log the update
      logger.info("🔄 Progress Update:", data);
    }

    // Save to database if execution context is available
    if (context?.executionId) {
      try {
        // Get current step count for this execution
        const executionData = await agentExecutionService.getExecutionWithSteps(
          context.executionId
        );
        const stepOrder = executionData ? executionData.steps.length + 1 : 1;

        await agentExecutionService.addStep({
          executionId: context.executionId,
          stepType: data.type,
          content: data.content,
          metadata: data.metadata,
          stepOrder,
        } as any);
      } catch (error) {
        logger.error("Failed to save execution step:", error);
      }
    }
  };

  /**
   * Handle LLM response - evaluation, storage, and streaming
   */
  const handleLLMResponse = async (
    response: AgentResponse,
    context: AgentFlowContext
  ): Promise<FlowStepResult> => {
    if (!response.content) {
      return { shouldBreak: false };
    }

    userLogger.log("[agent-flow.service.ts] handleLLMResponse response: ", {
      response,
    });

    userLogger.log(
      "[agent-flow.service.ts] handleLLMResponse we are going to store the next nmessage do we ? : "
    );

    // Store the main response
    const assistantMessage = await serviceRegistry
      .get("conversation")
      .addMessage({
        message: { role: "assistant", content: response.content },
        conversationId: context.conversationId,
      });

    const { shouldBreak, conclusion } = await serviceRegistry
      .get("evaluation")
      .evaluateResponse({
        userMessage: context.userMessage,
        response: response.content,
        originalToolResponse: "",
        conversationHistory: context.conversationHistory,
        send: (() => {
          if (!globalSendFunction) {
            throw new Error(
              "globalSendFunction is not initialized. Message streaming cannot proceed."
            );
          }
          return globalSendFunction;
        })(),
      });

    if (shouldBreak) {
      return { shouldBreak: true, conclusion };
    }

    // Link execution to the assistant message if we have an executionId
    if (context.executionId && assistantMessage) {
      try {
        await agentExecutionService.updateExecution(context.executionId, {
          messageId: assistantMessage.id,
        });
      } catch (error) {
        logger.error("Failed to link execution to message:", error);
      }
    }

    // Send response via stream
    await sendUpdate(
      {
        type: "llm_response",
        content: response.content,
        metadata: {
          agentStatus: serviceRegistry.get("agent").getStatus(),
          agentType: context.agentType,
        },
      },
      context
    );

    return { shouldBreak: false, conclusion };
  };

  /**
   * Handle tool calls - execution, rephrasing, and evaluation
   */
  const handleToolCalls = async (
    response: AgentResponse,
    context: AgentFlowContext
  ): Promise<ToolExecutionResult | null> => {
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return null;
    }

    const toolCall = response.tool_calls[0];
    // TODO: fix this
    // @ts-ignore
    const toolCallId = toolCall.id;

    // Store tool call message with proper format for transformMessagesForAI
    // The transformMessagesForAI function expects tool calls to be stored as JSON in content
    // with tool_call_id present to identify it as a tool call
    await serviceRegistry.get("conversation").addMessage({
      message: {
        role: "assistant",
        // TODO: fix this
        // @ts-ignore
        content: JSON.stringify(toolCall.function), // Store function call as JSON in content
        tool_call_id: toolCallId, // This identifies it as a tool call message
      } as any, // Cast to avoid TypeScript issues with tool_call_id on assistant messages
      conversationId: context.conversationId,
    });

    await sendUpdate(
      {
        type: "tool_execution",
        // TODO: fix this
        // @ts-ignore
        content: `${context.agentType} executing: ${toolCall.function.name}`,
        metadata: {
          source: "llm",
          // TODO: fix this
          // @ts-ignore
          functionName: toolCall.function.name,
          toolCallId: toolCallId,
          // TODO: fix this
          // @ts-ignore
          toolCallArguments: toolCall.function.arguments,
          agentType: context.agentType,
        },
      },
      context
    );

    // Execute tool
    const toolResponse = await executeToolForAgent({
      toolCall,
      agentType: context.agentType,
      agent: context.agent,
      userMessage: context.userMessage,
      context,
    });

    // Store tool response
    await serviceRegistry.get("conversation").saveToolResponse({
      toolCallId,
      toolResponse: toolResponse as string,
      conversationId: context.conversationId,
    });

    await sendUpdate(
      {
        type: "tool_response",
        content: toolResponse as string,
        metadata: {
          originalToolResponse: toolResponse,
          agentType: context.agentType,
          isRaw: true,
        },
      },
      context
    );

    // Rephrase tool response
    const rephraser = await agentFactory.createAgent("rephraser");
    const rawRephrasedToolResponse = await rephraser.act({
      messages: [{ role: "user", content: toolResponse as string }],
    });

    // 🔥 VALIDATE REPHRASER RESPONSE WITH ZOD
    const rephraserValidation = validateAgentActResponse(
      rawRephrasedToolResponse,
      "rephraser"
    );
    const rephrasedToolResponse = rephraserValidation.data;

    if (!rephraserValidation.success) {
      logger.warn(
        "⚠️ Rephraser agent returned invalid response, using fallback content extraction"
      );
    }

    const rephrasedContent =
      typeof rephrasedToolResponse === "string"
        ? rephrasedToolResponse
        : rephrasedToolResponse?.content || rephrasedToolResponse;

    // Evaluate rephrased response
    const { shouldBreak, conclusion } = await serviceRegistry
      .get("evaluation")
      .evaluateResponse({
        userMessage: context.userMessage,
        response: rephrasedContent as string,
        originalToolResponse: toolResponse as string,
        conversationHistory: context.conversationHistory,
        send: globalSendFunction || (async () => {}),
      });

    // Store conclusion
    if (conclusion) {
      await serviceRegistry.get("conversation").addMessage({
        message: { role: "assistant", content: conclusion },
        conversationId: context.conversationId,
      });
    }

    if (shouldBreak) {
      return {
        toolResponse,
        rephrasedContent: rephrasedContent as string,
        shouldBreak: true,
        conclusion,
      };
    }

    // Send rephrased response
    await sendUpdate(
      {
        type: "tool_response",
        content: rephrasedContent as string,
        metadata: {
          originalToolResponse: toolResponse,
          agentType: context.agentType,
          isRephrased: true,
        },
      },
      context
    );

    return {
      toolResponse,
      rephrasedContent: rephrasedContent as string,
      shouldBreak: false,
      conclusion,
    };
  };

  /**
   * Execute a single agent iteration (LLM call + response handling)
   */
  const executeAgentIteration = async (
    messages: ChatMessage[],
    context: AgentFlowContext
  ): Promise<FlowStepResult> => {
    userLogger.log("[agent-flow.service.ts] executeAgentIteration start: ", {
      messages,
    });

    sendUpdate(
      {
        type: "unknown",
        content: "🔄 Starting agent iteration",
        metadata: {
          messages: messages,
        },
      },
      undefined
    );

    // Get agent response with full context
    if (context.sessionData?.contextData) {
      logger.info(
        "🔄 Context includes contextData from session:",
        context.sessionData.contextData
      );
    }

    const rawResponse = await context.agent.act({
      messages,
      tools: [], // agent.act will have its own tools
      context, // Pass the full context
    });

    userLogger.log(
      "[agent-flow.service.ts] executeAgentIteration rawResponse: ",
      {
        rawResponse,
      }
    );

    // 🔥 VALIDATE AGENT RESPONSE WITH ZOD
    const validation = validateAgentActResponse(rawResponse, context.agentType);
    const response = validation.data; // Use validated data (or raw data for graceful degradation)

    if (!validation.success) {
      // Send warning to client if possible
      await sendUpdate(
        {
          type: "tool_response", // Using tool_response type for internal messages
          content: `⚠️ Agent "${context.agentType}" returned invalid response format. Attempting graceful recovery...`,
          metadata: {
            source: "validation_system",
            agentType: context.agentType,
            validationError: validation.error?.issues,
            isRaw: true,
          },
        },
        context
      );
    }

    let finalConclusion: string | undefined;

    // Handle LLM response
    if (response.content) {
      const llmResult = await handleLLMResponse(response, context);
      if (llmResult.shouldBreak) {
        return { shouldBreak: true, conclusion: llmResult.conclusion };
      }
      if (llmResult.conclusion) {
        finalConclusion = llmResult.conclusion;
      }
    }

    // Handle tool calls
    if (response.tool_calls) {
      const toolResult = await handleToolCalls(response, context);
      if (toolResult?.shouldBreak) {
        return { shouldBreak: true, conclusion: toolResult.conclusion };
      }
      if (toolResult?.conclusion) {
        finalConclusion = toolResult.conclusion;
      }
    }

    return { shouldBreak: false, conclusion: finalConclusion };
  };

  /**
   * Execute autonomous agent flow with multiple iterations
   */
  const executeAutonomousFlow = async (
    context: AgentFlowContext,
    options: AgentFlowOptions = { autonomousMode: false }
  ): Promise<string | null> => {
    const MAX_REQUESTS = options.maxRequests || 10;
    const agentIsAutonomous = options.autonomousMode;
    let requestsCount = 0;
    let finalConclusion: string | null = null;

    // Create execution record for tracking
    let executionId: number | undefined;

    userLogger.log(
      "[agent-flow.service.ts] executeAutonomousFlow: [createExecution]",
      {
        executionArguments: {
          conversationId: context.conversationId,
          triggeringMessageId: context.userMessageId,
          agentType: context.agentType,
          status: "running",
          autonomousMode: agentIsAutonomous,
          totalSteps: 0,
        },
      }
    );

    try {
      executionId = await agentExecutionService.createExecution({
        conversationId: context.conversationId,
        triggeringMessageId: context.userMessageId,
        agentType: context.agentType,
        status: "running",
        autonomousMode: agentIsAutonomous,
        totalSteps: 0,
      } as any);

      // Add executionId to context for step tracking
      context.executionId = executionId;

      userLogger.info(
        `Created execution record ${executionId} for ${context.agentType}, triggered by message ${context.userMessageId}`
      );
    } catch (error) {
      logger.error("Failed to create execution record:", error);
    }

    // Note: User message is already saved as regular message, no need to duplicate as execution step

    do {
      // Check if stream is still active
      if (options.streamState && !options.streamState.isActive) {
        userLogger.info("Client disconnected, stopping stream");
        break;
      }

      await sendUpdate(
        {
          type: "thinking",
          content: `${context.agentType} is thinking...`,
        },
        context
      );

      const freshConversationHistory = await serviceRegistry
        .get("database")
        .getConversationHistory(context.conversationId);
      const refreshedMessages = transformMessagesForAI(
        freshConversationHistory
      );

      let attachmentMessage: ChatMessage | null = null;

      if (context.uploadedAttachments?.[0]?.url) {
        attachmentMessage = {
          role: "user",
          content: context.uploadedAttachments.map((attachment) => ({
            type: "image_url",
            image_url: {
              url: attachment.url,
            },
          })),
        };
      }

      if (attachmentMessage) {
        refreshedMessages.push(attachmentMessage);
      }

      userLogger.info("agent-flow refreshed messages: ", refreshedMessages);

      // Execute single iteration with refreshed conversation history
      const result = await executeAgentIteration(refreshedMessages, context);

      if (result.conclusion) {
        finalConclusion = result.conclusion;
      }

      if (result.shouldBreak) {
        break;
      }

      requestsCount++;
      userLogger.info(
        `${context.agentType} completed iteration ${requestsCount}`
      );
    } while (agentIsAutonomous && requestsCount < MAX_REQUESTS);

    // Handle max requests reached
    if (requestsCount === MAX_REQUESTS) {
      const tooManyRequestsContent = `${context.agentType} reached maximum requests. Task may be too complex.`;
      await serviceRegistry.get("conversation").addMessage({
        message: { role: "assistant", content: tooManyRequestsContent },
        conversationId: context.conversationId,
      });

      await sendUpdate(
        {
          type: "llm_response",
          content: tooManyRequestsContent,
        },
        context
      );

      finalConclusion = tooManyRequestsContent;
    }

    // Send finished step and update execution status
    await sendUpdate(
      {
        type: "finished",
        content: "Conversation ended",
        metadata: {
          conclusion: finalConclusion,
          agentType: context.agentType,
          agentStatus: serviceRegistry.get("agent").getStatus(),
        },
      },
      context
    );

    // Update execution status to completed
    if (executionId) {
      try {
        await agentExecutionService.updateExecution(executionId, {
          status: "completed",
          totalSteps: requestsCount,
        });
        userLogger.info(`Completed execution ${executionId}`);
      } catch (error) {
        logger.error("Failed to update execution status:", error);
      }
    }

    return finalConclusion;
  };

  /**
   * Execute tool for agent (extracted from main API)
   */
  const executeToolForAgent = async ({
    toolCall,
    agentType,
    agent,
    userMessage,
    context,
  }: {
    toolCall: any;
    agentType: string;
    agent: Agent;
    userMessage: string;
    context?: AgentFlowContext;
  }): Promise<any> => {
    const startTime = Date.now();
    const toolName = toolCall.function.name;

    // Log tool execution start
    if (context) {
      await sendUpdate(
        {
          type: "tool_execution",
          content: `🔍 Looking for tool: ${toolName}`,
          metadata: {
            phase: "tool_discovery",
            toolName,
            agentType,
          },
        },
        context
      );
    }

    // Special handling for list_available_tools
    if (toolName === "list_available_tools") {
      return await generateDynamicToolList(agentType, agent);
    }

    // Check unified tool registry first
    const unifiedTool = unifiedToolsRegistry.runner.getTool(toolName);
    if (unifiedTool) {
      if (context) {
        await sendUpdate(
          {
            type: "tool_execution",
            content: `✅ Found unified tool: ${toolName} (${unifiedTool.source} tool)`,
            metadata: {
              phase: "tool_found",
              toolName,
              toolSource: unifiedTool.source,
              toolVersion: unifiedTool.version,
              hasUnifiedImplementation: true,
            },
          },
          context
        );

        // Special logging for create_image to confirm unified tool usage
        if (toolName === "create_image") {
          await sendUpdate(
            {
              type: "tool_execution",
              content: `🎨 IMAGE GENERATION: Using UNIFIED create_image tool v${unifiedTool.version || "1.0.0"}`,
              metadata: {
                phase: "unified_tool_confirmed",
                toolName,
                unifiedVersion: unifiedTool.version,
                toolDescription: unifiedTool.description,
                isDefinitelyUnified: true,
                unifiedMetadata: unifiedTool.sourceMetadata,
                message: "This is 100% coming from the unified tool registry!",
              },
            },
            context
          );
        }

        // Log detailed unified tool info for debugging
        logger.info(`🔍 UNIFIED TOOL DETAILS for ${toolName}:`, {
          name: unifiedTool.name,
          version: unifiedTool.version,
          source: unifiedTool.source,
          description: unifiedTool.description,
          hasValidation: !!unifiedTool.validate,
          hasEstimateCost: !!unifiedTool.estimateCost,
          metadata: unifiedTool.sourceMetadata,
        });
      }

      try {
        // Parse arguments if they're a string
        const args =
          typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;

        // Create tool context for unified tools
        const toolContext = context
          ? {
              conversationId: context.conversationId,
              executionId: context.executionId?.toString(),
              // Note: delegation will be added later
            }
          : {
              conversationId: 0, // Fallback for tools without context
            };

        // Execute via unified runner
        const result = await unifiedToolsRegistry.runner.executeTool(
          toolName,
          args,
          toolContext
        );

        const executionTime = Date.now() - startTime;

        if (context) {
          await sendUpdate(
            {
              type: "tool_response",
              content: `✅ Unified tool executed successfully in ${executionTime}ms`,
              metadata: {
                phase: "tool_completed",
                toolName,
                toolSource: unifiedTool.source,
                executionTime,
                success: result.success,
              },
            },
            context
          );

          // Extra confirmation for create_image
          if (toolName === "create_image" && result.success) {
            await sendUpdate(
              {
                type: "tool_response",
                content: `🎨 UNIFIED IMAGE CREATED: ${result.data}`,
                metadata: {
                  phase: "unified_tool_success",
                  toolName,
                  definitelyFromUnifiedRegistry: true,
                  unifiedToolVersion: unifiedTool.version,
                  message: "Image was generated using the UNIFIED tool system!",
                },
              },
              context
            );
          }
        }

        return result.success ? result.data : result.error;
      } catch (error) {
        logger.error(`Failed to execute unified tool ${toolName}:`, error);
        if (context) {
          await sendUpdate(
            {
              type: "tool_response",
              content: `❌ Unified tool execution failed: ${error}`,
              metadata: {
                phase: "tool_error",
                toolName,
                toolSource: unifiedTool.source,
                error: String(error),
              },
            },
            context
          );
        }
        return `Error executing tool ${toolName}: ${error}`;
      }
    }

    // Log that we're falling back to legacy tool handling
    if (context) {
      await sendUpdate(
        {
          type: "tool_execution",
          content: `🔄 Checking legacy tool registries for: ${toolName}`,
          metadata: {
            phase: "legacy_check",
            toolName,
          },
        },
        context
      );
    }

    const figmaContextMcpService =
      await mcpServersFactory.createFigmaMCPServiceClient();

    // Check if it's a Figma MCP tool
    if (figmaContextMcpService?.isTool(toolName)) {
      if (
        [
          "general",
          "figma-analyzer",
          "IRFLayoutArchitecture",
          "figma-to-storyblok",
        ].includes(agentType)
      ) {
        if (context) {
          await sendUpdate(
            {
              type: "tool_execution",
              content: `📐 Found Figma MCP tool: ${toolName}`,
              metadata: {
                phase: "tool_found",
                toolName,
                toolSource: "mcp_figma",
                isLegacy: true,
              },
            },
            context
          );
        }

        const result = await figmaContextMcpService.handleToolCall(
          toolCall.function
        );

        const executionTime = Date.now() - startTime;
        if (context) {
          await sendUpdate(
            {
              type: "tool_response",
              content: `✅ Figma MCP tool executed in ${executionTime}ms`,
              metadata: {
                phase: "tool_completed",
                toolName,
                toolSource: "mcp_figma",
                executionTime,
              },
            },
            context
          );
        }

        return typeof result === "string" ? result : JSON.stringify(result);
      } else {
        if (context) {
          await sendUpdate(
            {
              type: "tool_response",
              content: `❌ Tool '${toolName}' not available to ${agentType} agent`,
              metadata: {
                phase: "tool_denied",
                toolName,
                agentType,
                reason: "permission",
              },
            },
            context
          );
        }
        return `Tool '${toolName}' not available to ${agentType} agent.`;
      }
    }

    // Check if it's a local tool
    if (serviceRegistry.get("toolRunner").isLocalTool(toolName)) {
      if (context) {
        await sendUpdate(
          {
            type: "tool_execution",
            content: `🛠️ Found local tool: ${toolName}`,
            metadata: {
              phase: "tool_found",
              toolName,
              toolSource: "local_legacy",
              isLegacy: true,
            },
          },
          context
        );
      }

      // Create tool context for unified tools
      const toolContext = context
        ? {
            conversationId: context.conversationId,
            executionId: context.executionId?.toString(),
            delegation: context.delegation,
          }
        : undefined;

      const result = await serviceRegistry
        .get("toolRunner")
        .runTool(toolCall, userMessage, toolContext);

      const executionTime = Date.now() - startTime;
      if (context) {
        await sendUpdate(
          {
            type: "tool_response",
            content: `✅ Local tool executed in ${executionTime}ms`,
            metadata: {
              phase: "tool_completed",
              toolName,
              toolSource: "local_legacy",
              executionTime,
            },
          },
          context
        );
      }

      return result;
    }

    // Tool not found
    if (context) {
      await sendUpdate(
        {
          type: "tool_response",
          content: `❌ Tool '${toolName}' not found`,
          metadata: {
            phase: "tool_not_found",
            toolName,
            agentType,
            checkedSources: ["unified", "mcp_figma", "local_legacy"],
          },
        },
        context
      );
    }

    return `Tool '${toolName}' not found or not available to ${agentType} agent.`;
  };

  /**
   * Generate dynamic tool list (extracted from main API)
   */
  const generateDynamicToolList = async (
    agentType: string,
    agent: Agent
  ): Promise<string> => {
    // Get unified tools first
    const unifiedTools = unifiedToolsRegistry.runner.listTools();

    // Log unified tool discovery
    await sendUpdate(
      {
        type: "tool_response",
        content: `📊 Loading tool registry: ${unifiedTools.length} unified tools available`,
        metadata: {
          phase: "tool_list_generation",
          unifiedToolCount: unifiedTools.length,
          bySource: {
            local: unifiedTools.filter((t) => t.source === "local").length,
            mcp: unifiedTools.filter((t) => t.source === "mcp").length,
            agent: unifiedTools.filter((t) => t.source === "agent").length,
            external: unifiedTools.filter((t) => t.source === "external")
              .length,
          },
        },
      },
      undefined // No context for tool list generation
    );

    // Get legacy tools from agent
    const legacyTools = agent.availableTools;

    // Filter out the list_available_tools tool itself to avoid recursion
    const legacyToolsToShow = legacyTools.filter(
      (tool) =>
        tool.name !== "list_available_tools" &&
        tool.function?.name !== "list_available_tools"
    );

    // Combine unified and legacy tools, avoiding duplicates
    const unifiedToolNames = new Set(unifiedTools.map((t) => t.name));
    const allTools = [
      ...unifiedTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        source: tool.source,
        isUnified: true,
      })),
      ...legacyToolsToShow
        .filter((tool) => {
          const toolName = tool.name || tool.function?.name;
          return !unifiedToolNames.has(toolName);
        })
        .map((tool) => ({
          name: tool.name || tool.function?.name || "Unknown Tool",
          description:
            tool.description ||
            tool.function?.description ||
            "No description available",
          source: "legacy",
          isUnified: false,
        })),
    ];

    const agentDescriptions: Record<string, string> = {
      general:
        "🤖 General Assistant - I have access to all available tools for complex, multi-step tasks",
      "test-openrouter":
        "🧪 OpenRouter Test - I use experimental OpenRouter models for testing and advanced capabilities",
      scribe:
        "✍️ Scribe - I specialize in writing, content creation, and document management",
      rephraser:
        "🔄 Rephraser - I focus on improving text clarity and readability",
      "figma-analyzer":
        "🎨 Figma Analyzer - I analyze and work with Figma designs and components",
      storyblok:
        "📝 Storyblok Assistant - I help with CMS operations and content management",
      IRFLayoutArchitecture:
        "🏗️ Layout Architect - I create and manage design system layouts",
      "figma-to-storyblok":
        "🔄 Figma to Storyblok - I transform Figma designs into Storyblok components",
    };

    const agentDescription =
      agentDescriptions[agentType] || `${agentType} Agent`;

    let response = `# My Capabilities\n\n`;
    response += `${agentDescription}\n\n`;
    response += `## Available Tools (${allTools.length})\n\n`;

    // Add source breakdown
    const sourceBreakdown = {
      unified: allTools.filter((t) => t.isUnified).length,
      legacy: allTools.filter((t) => !t.isUnified).length,
      bySource: {
        local: allTools.filter((t) => t.source === "local").length,
        mcp: allTools.filter((t) => t.source === "mcp").length,
        agent: allTools.filter((t) => t.source === "agent").length,
        external: allTools.filter((t) => t.source === "external").length,
        legacy: allTools.filter((t) => t.source === "legacy").length,
      },
    };

    response += `**Tool Sources**: ${sourceBreakdown.unified} unified tools, ${sourceBreakdown.legacy} legacy tools\n\n`;

    if (allTools.length === 0) {
      response +=
        "I currently don't have any specialized tools available, but I can still help with general conversation and analysis.\n";
      return response;
    }

    // Group tools by category for better organization
    const toolCategories: Record<string, any[]> = {
      "Planning & Memory": [],
      "Content Creation": [],
      "Design & Layout": [],
      "External Services": [],
      "Agent Tools": [],
      Other: [],
    };

    allTools.forEach((tool: any) => {
      const toolName = tool.name;
      const description = tool.description;
      const sourceLabel = tool.isUnified ? `[${tool.source}]` : "[legacy]";

      // Categorize tools
      if (tool.source === "agent") {
        toolCategories["Agent Tools"]?.push({
          name: toolName,
          description,
          sourceLabel,
        });
      } else if (toolName.includes("plan") || toolName.includes("memory")) {
        toolCategories["Planning & Memory"]?.push({
          name: toolName,
          description,
          sourceLabel,
        });
      } else if (
        toolName.includes("create") ||
        toolName.includes("compose") ||
        toolName.includes("layout")
      ) {
        toolCategories["Content Creation"]?.push({
          name: toolName,
          description,
          sourceLabel,
        });
      } else if (toolName.includes("figma") || toolName.includes("design")) {
        toolCategories["Design & Layout"]?.push({
          name: toolName,
          description,
          sourceLabel,
        });
      } else if (
        toolName.includes("url") ||
        toolName.includes("api") ||
        toolName.includes("external")
      ) {
        toolCategories["External Services"]?.push({
          name: toolName,
          description,
          sourceLabel,
        });
      } else {
        toolCategories["Other"]?.push({
          name: toolName,
          description,
          sourceLabel,
        });
      }
    });

    // Display tools by category
    Object.entries(toolCategories).forEach(([category, tools]) => {
      if (tools.length > 0) {
        response += `### ${category}\n`;
        tools.forEach((tool: any) => {
          response += `- **${tool.name}** ${tool.sourceLabel}: ${tool.description}\n`;
        });
        response += `\n`;
      }
    });

    response += `\n💡 **How to use**: Just ask me to do something, and I'll automatically choose the right tools to help you!\n`;
    response += `\n🔧 **Tool System**: Using unified tool registry with ${sourceBreakdown.unified} modern tools and ${sourceBreakdown.legacy} legacy tools.\n`;

    return response;
  };

  // Return public interface
  return {
    handleLLMResponse,
    handleToolCalls,
    executeAgentIteration,
    executeAutonomousFlow,
    executeToolForAgent,
    generateDynamicToolList,
    // Global send function management
    setSendFunction,
    clearSendFunction,
    sendUpdate,
  };
};

// Export singleton instance
export const agentFlowService = createAgentFlowService();
