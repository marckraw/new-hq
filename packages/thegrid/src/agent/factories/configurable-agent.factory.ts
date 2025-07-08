import { logger } from "@/utils/logger";
import { eventBus } from "@/eda/events/event-bus";
import { createBaseAgent } from "./BaseAgent";
import { Agent, AgentResponse } from "./agents.factory.types";
import { AgentConfig } from "../schemas/agent-config.schemas";
import { createAgentToolsForTypes } from "../tools/agent-tool.factory";
import { unifiedToolsRegistry } from "../tools/unified/unified-tools.registry";

// Custom handler types for hooks
export interface CustomHandlers {
  beforeAct?: (input: any) => Promise<any>;
  afterResponse?: (response: any, input: any) => Promise<any>;
  onError?: (error: Error, attempt: number) => Promise<any>;
  validateResponse?: (response: any) => Promise<{ isValid: boolean; errors?: any[] }>;
  transformInput?: (input: any) => Promise<any>;
  transformOutput?: (output: any) => Promise<any>;
}

// Additional tools that can be passed
export interface AdditionalTools {
  local?: any[];
  mcp?: any[];
  agents?: any[];
}

export interface CreateConfigurableAgentOptions {
  config: AgentConfig;
  customHandlers?: CustomHandlers;
  additionalTools?: AdditionalTools;
}

/**
 * Creates an agent based on configuration with optional custom handlers
 */
export const createConfigurableAgent = ({
  config,
  customHandlers = {},
  additionalTools = {},
}: CreateConfigurableAgentOptions): Agent => {
  // Create base agent
  const base = createBaseAgent({
    id: config.id,
    type: config.type,
  });
  
  // Build tools array based on configuration
  const buildTools = () => {
    const tools = [...base.availableTools];
    
    // Add built-in tools
    if (config.tools.builtin.length > 0) {
      // const toolRunner = serviceRegistry.get("toolRunner");
      config.tools.builtin.forEach((toolName: string) => {
        // TODO: Get tool from tool registry
        logger.debug(`Adding built-in tool: ${toolName}`);
      });
    }
    
    // Add custom tools
    if (config.tools.custom) {
      // TODO: Get from custom tool registry
      logger.debug(`Adding ${config.tools.custom.length} custom tools`);
    }
    
    // Add MCP tools
    if (config.tools.mcp) {
      // TODO: Get from MCP registry
      logger.debug(`Adding ${config.tools.mcp.length} MCP tools`);
    }
    
    // Add agent tools (for orchestration)
    if (config.tools.agents && config.tools.agents.length > 0) {
      logger.debug(`Creating ${config.tools.agents.length} agent delegation tools`);
      
      // Create delegation tools for specified agent types
      const agentTools = createAgentToolsForTypes(config.tools.agents as any);
      
      // Register each tool with the unified tool runner
      agentTools.forEach(tool => {
        unifiedToolsRegistry.runner.registerTool(tool);
        logger.debug(`Registered delegation tool: ${tool.name}`);
      });
      
      // Convert to LLM tool format and add to tools array
      const llmAgentTools = agentTools.map(tool => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: {
              messages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    role: { type: "string", enum: ["user", "assistant", "system"] },
                    content: { type: "string" }
                  },
                  required: ["role", "content"]
                }
              },
              context: {
                type: "object",
                description: "Additional context for the agent"
              }
            },
            required: ["messages"]
          }
        }
      }));
      
      tools.push(...llmAgentTools);
      logger.info(`[${config.id}] Added ${llmAgentTools.length} agent delegation tools:`, llmAgentTools.map(t => t.function.name));
    }
    
    // Add any additional tools passed directly
    if (additionalTools.local) tools.push(...additionalTools.local);
    if (additionalTools.mcp) tools.push(...additionalTools.mcp);
    if (additionalTools.agents) tools.push(...additionalTools.agents);
    
    return tools;
  };
  
  const availableTools = buildTools();
  
  return {
    ...base,
    availableTools,
    
    // Enhanced metadata with config info
    getMetadata: () => ({
      ...config.metadata,
      configVersion: config.version,
      orchestration: config.orchestration,
    }),
    
    // Main act method with all enhancements
    act: async (input) => {
      // Transform input if hook is configured
      if (config.hooks?.transformInput && customHandlers.transformInput) {
        input = await customHandlers.transformInput(input);
      }
      
      // Pre-processing hook
      if (config.hooks?.beforeAct && customHandlers.beforeAct) {
        input = await customHandlers.beforeAct(input);
      }
      
      let attempt = 0;
      let lastValidationResult = null;
      let lastError = null;
      
      while (attempt < config.behavior.maxRetries) {
        attempt++;
        
        try {
          // Prepare messages with system prompt
          const messages = [
            { role: "system" as const, content: config.prompts.system },
            ...input.messages,
          ];
          
          // Add error correction message if we have validation errors from previous attempt
          if (lastValidationResult && !lastValidationResult.isValid && config.prompts.errorCorrection) {
            messages.push({
              role: "user" as const,
              content: config.prompts.errorCorrection.replace(
                "{errors}",
                JSON.stringify(lastValidationResult.errors || lastValidationResult)
              ),
            });
          }
          
          // Call LLM based on response format
          let response: AgentResponse;
          
          // Use tools from input if modified by hooks, otherwise use availableTools
          const toolsToUse = (input.tools && input.tools.length > 0) ? input.tools : availableTools;
          
          // Debug logging for site-builder
          if (config.id === "site-builder") {
            logger.info(`[${config.id}] Calling LLM with ${toolsToUse.length} tools:`, toolsToUse.map((t: any) => t.function?.name || t.name));
          }
          
          if (config.behavior.responseFormat === "json") {
            const llmResponse = await base.llmService.runCleanLLMWithJSONResponse({
              messages,
              tools: toolsToUse,
            });
            response = llmResponse as AgentResponse;
          } else {
            const llmResponse = await base.llmService.runLLM({
              messages,
              tools: toolsToUse,
            });
            response = llmResponse as AgentResponse;
          }
          
          // Debug logging for site-builder
          if (config.id === "site-builder") {
            logger.info(`[${config.id}] LLM response:`, {
              hasToolCalls: !!(response as any).tool_calls,
              toolCallsCount: (response as any).tool_calls?.length || 0,
              responseType: typeof response,
              content: (response as any).content?.substring(0, 100),
            });
          }
          
          // Custom response processing
          if (config.hooks?.afterResponse && customHandlers.afterResponse) {
            response = await customHandlers.afterResponse(response, input);
          }
          
          // Validation if configured
          if (config.behavior.validateResponse && customHandlers.validateResponse) {
            const validation = await customHandlers.validateResponse(response);
            if (!validation.isValid) {
              lastValidationResult = validation;
              logger.warn(`Response validation failed for ${config.id} (attempt ${attempt}/${config.behavior.maxRetries})`);
              
              // Log validation errors for visibility
              logger.error(`Validation errors for ${config.id}:`, validation.errors);
              
              // If this is not the last attempt, continue to retry
              if (attempt < config.behavior.maxRetries) {
                continue;
              }
              
              // Last attempt - log that max retries reached
              logger.error(`Max validation retries reached for ${config.id}`);
            }
          }
          
          // Emit configured events
          if (config.behavior.emitEvents && config.behavior.emitEvents.length > 0) {
            for (const eventName of config.behavior.emitEvents) {
              logger.debug(`Emitting event: ${eventName}`);
              eventBus.emit(eventName as any, {
                agentId: config.id,
                agentType: config.type,
                response,
                input,
                metadata: {
                  attempt,
                  totalAttempts: config.behavior.maxRetries,
                },
              });
            }
          }
          
          // Transform output if hook is configured
          if (config.hooks?.transformOutput && customHandlers.transformOutput) {
            response = await customHandlers.transformOutput(response);
          }
          
          return response;
          
        } catch (error) {
          lastError = error;
          logger.error(`Error in ${config.id} agent (attempt ${attempt}/${config.behavior.maxRetries})`, error);
          
          // Custom error handling
          if (config.hooks?.onError && customHandlers.onError) {
            const handled = await customHandlers.onError(error as Error, attempt);
            if (handled) {
              return handled;
            }
          }
          
          // If this is the last attempt, throw the error
          if (attempt >= config.behavior.maxRetries) {
            throw error;
          }
          
          // Otherwise, continue to next attempt
          logger.info(`Retrying ${config.id} agent (attempt ${attempt + 1}/${config.behavior.maxRetries})`);
        }
      }
      
      // This should not be reached, but just in case
      throw lastError || new Error(`Failed to get response from ${config.id} after ${config.behavior.maxRetries} attempts`);
    },
  };
};