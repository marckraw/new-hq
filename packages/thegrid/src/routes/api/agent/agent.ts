import { logger, userLogger } from "@/utils/logger";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { agentFactory } from "../../../agent/factories/agents.factory";
import { SessionData } from "../../../db/schema/sessions";
import { serviceRegistry } from "../../../registry/service-registry";
import type { UploadedAttachment } from "../../../schemas/agent-flow.schemas";
import { databaseService } from "../../../services/atoms/DatabaseService/database.service";
import { sessionService } from "../../../services/atoms/SessionService/session.service";
import { transformMessagesForAI } from "../shared";
import {
  getAvailableAgentsRoute,
  initAgentRoute,
  stopStreamRoute,
} from "./agent.routes";

// Create OpenAPIHono router for documented endpoints
export const agentRouter = new OpenAPIHono();

// Create regular Hono router for streaming endpoints
const streamRouter = new Hono();

// GET /available-agents
agentRouter.openapi(getAvailableAgentsRoute, async (c) => {
  try {
    // Check if debug mode is enabled
    const settingsService = serviceRegistry.get("settings");
    const debugModeSetting = await settingsService.getSetting(
      "interface",
      "debugMode"
    );
    const isDebugMode = debugModeSetting?.value === true;

    logger.info(`Agent: Getting available agents. Debug mode: ${isDebugMode}`);

    // Get agent metadata from factory
    let agents = agentFactory.getAllAgentMetadata();

    // Filter out test agents if not in debug mode
    if (!isDebugMode) {
      agents = agents.filter((agent) => !agent.type.includes("test"));
    }

    // Convert to expected format with all required properties
    const formattedAgents = agents.map((agent) => ({
      type: agent.type,
      name: agent.name,
      description: agent.description,
      id: agent.id,
      capabilities: agent.capabilities,
      icon: agent.icon,
      version: agent.version,
      author: agent.author,
    }));

    return c.json(
      {
        success: true,
        data: formattedAgents,
      } as const,
      200
    );
  } catch (error) {
    logger.error("Failed to get available agents", error);
    return c.json(
      {
        success: false,
        error: {
          message: "Failed to retrieve available agents",
          code: "AGENTS_FETCH_ERROR",
        },
      } as const,
      500
    );
  }
});

// POST /init
agentRouter.openapi(initAgentRoute, async (c) => {
  try {
    const requestData = c.req.valid("json");
    const {
      messages,
      conversationId,
      agentType,
      autonomousMode,
      modelId,
      attachments,
      contextData,
    } = requestData;

    // If no conversation ID provided, create a new conversation
    let currentConversationId = conversationId
      ? Number(conversationId)
      : undefined;
    let userMessageId: number | undefined;

    if (!currentConversationId) {
      // Create a new conversation with the first user message as title
      const userMessage = messages.find((msg) => msg.role === "user");
      const title = userMessage?.content.slice(0, 50) + "...";

      const conversation = await databaseService.createConversation({
        title,
        systemMessage: "You are a helpful AI assistant.",
      });

      if (!conversation) {
        throw new Error("Failed to create conversation");
      }

      currentConversationId = conversation.id;

      // Add the initial message to the conversation
      if (userMessage) {
        const savedUserMessage = await databaseService.addMessage({
          conversationId: currentConversationId,
          role: userMessage.role,
          content: userMessage.content,
        });
        userMessageId = savedUserMessage?.id;
      }
    } else {
      // For existing conversations, save the new user message to database
      const firstMessage = messages.find((msg) => msg.role === "user");
      if (firstMessage) {
        const savedUserMessage = await databaseService.addMessage({
          conversationId: currentConversationId,
          role: firstMessage.role,
          content: firstMessage.content,
        });
        userMessageId = savedUserMessage?.id;
      }
    }

    // Create a session for streaming
    const firstMessage = messages.find((msg) => msg.role === "user");
    if (!firstMessage) {
      throw new Error("No user message provided");
    }

    const sessionData: SessionData = {
      message: {
        content: firstMessage.content,
        role: firstMessage.role,
      },
      conversationId: currentConversationId,
      userMessageId: userMessageId || 0, // Add user message ID for linking executions
      autonomousMode, // Include autonomous mode
      agentType, // Include agent type
      attachments: attachments || [], // Include attachments
      modelId,
      // Include contextData if provided
      ...(contextData && {
        contextData,
      }),
    };

    // Generate a unique token and set expiration (10 minutes from now)
    const token = `agent_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10); // 10 minutes

    await sessionService.createSession(token, sessionData, expiresAt);

    return c.json(
      {
        streamToken: token,
        conversationId: currentConversationId,
      } as const,
      200
    );
  } catch (error) {
    logger.error("Agent init error:", error);
    return c.json(
      {
        success: false,
        error: {
          message: (error as Error).message || "Failed to initialize agent",
          code: "AGENT_INIT_ERROR",
        },
      } as const,
      500
    );
  }
});

// POST /stop-stream
agentRouter.openapi(stopStreamRoute, async (c) => {
  logger.info("Agent: stop-stream endpoint hit");
  const streamToken = c.req.query("streamToken");
  if (!streamToken) {
    return c.json({ error: "No stream token provided" } as const, 400);
  }

  const stopped = serviceRegistry.get("stream").stopStream(streamToken);
  if (stopped) {
    return c.json({ success: true } as const, 200);
  }

  return c.json({ error: "Stream not found" } as const, 404);
});

// GET /stream - Main agent SSE streaming endpoint (no bearer auth required - session token validates instead)
streamRouter.get("/stream", async (c) => {
  userLogger.log("[agent.ts] /stream: stream endpoint hit");
  const token = c.req.query("streamToken");

  if (!token) {
    return c.json({ error: "No stream token provided" } as const, 400);
  }

  // Get session from database - this validates the token
  const sessionData = await serviceRegistry.get("session").getSession(token);

  if (!sessionData) {
    return c.json({ error: "Invalid or expired token" } as const, 401);
  }

  // Extend session expiration by 5 minutes since it's being actively used
  await serviceRegistry.get("session").extendSession(token);
  userLogger.log(
    "[agent.ts] /stream: Extended session expiration by 5 minutes"
  );

  const userMessage = sessionData.message;
  const currentConversationId = sessionData.conversationId;
  const autonomousMode = sessionData.autonomousMode;
  const agentType = sessionData.agentType;
  const attachments = sessionData.attachments;

  // Register stream in service
  const streamState = serviceRegistry.get("stream").addStream(token);

  userLogger.log(
    "[agent.ts] /stream: [streamState from streamManager]",
    streamState
  );

  return streamSSE(c, async (stream) => {
    const logger = console;
    const send = serviceRegistry.get("stream").createSender(stream);

    stream.onAbort(() => {
      serviceRegistry.get("stream").stopStream(token);
      serviceRegistry.get("agent").setStatus("waiting-for-prompt");
    });

    try {
      serviceRegistry.get("agent").setStatus("working");

      // Save user message (only if not already saved during init)
      const conversationHistory = await serviceRegistry
        .get("database")
        .getConversationHistory(currentConversationId);

      userLogger.log(
        "[agent.ts] /stream inside streamSSE: [conversationHistory]",
        {
          conversationHistory,
        }
      );

      // Check if the user message is already the last message
      const lastMessage = conversationHistory[conversationHistory.length - 1];

      userLogger.log("[agent.ts] /stream inside streamSSE: [lastMessage]", {
        lastMessage: lastMessage,
      });

      // If the user message is the last message and is saved to the database already
      const isMessageAlreadySaved =
        lastMessage &&
        lastMessage.role === "user" &&
        lastMessage.content === userMessage.content;

      userLogger.log(
        "[agent.ts] /stream inside streamSSE: [isMessageAlreadySaved]",
        {
          isMessageAlreadySaved: isMessageAlreadySaved,
        }
      );

      if (!isMessageAlreadySaved) {
        const conversationService = serviceRegistry.get("conversation");
        await conversationService.addMessage({
          message: {
            role: "user",
            content: userMessage.content,
          },
          conversationId: currentConversationId,
        });
      }

      userLogger.log(
        "[agent.ts] /stream first send() event to frotnend: [user_message]",
        {
          type: "user_message",
          content: `User message: ${userMessage.content}`,
          metadata: { agentStatus: serviceRegistry.get("agent").getStatus() },
        }
      );

      // AGENT MODE: Original autonomous agent logic
      await send({
        type: "user_message",
        content: `User message: ${userMessage.content}`,
        metadata: { agentStatus: serviceRegistry.get("agent").getStatus() },
      });

      // Prepare messages for agents
      const messagesForAI = transformMessagesForAI(conversationHistory);

      userLogger.log(
        "[agent.ts] /stream inside streamSSE: [conversationHistory vs messagesForAI]",
        {
          conversationHistory,
          messagesForAI,
        }
      );

      // --- Attachment Uploading ---
      const uploadedAttachments: UploadedAttachment[] = [];

      if (attachments && attachments.length > 0) {
        await send({
          type: "agent_thought",
          content: "Uploading attachments...",
        });
        for (const attachment of attachments) {
          if (attachment.dataUrl) {
            try {
              const url = await serviceRegistry
                .get("aws")
                .uploadBase64ImageToS3(
                  attachment.dataUrl,
                  attachment.name
                  // TODO: Pass userId for uploadedBy field
                );
              uploadedAttachments.push({
                name: attachment.name,
                url,
                type: attachment.type,
              });
              await send({
                type: "agent_thought",
                content: `Successfully uploaded ${attachment.name}.`,
              });
            } catch (error) {
              logger.error("Failed to upload attachment", error);
              await send({
                type: "error",
                content: `Failed to upload attachment ${attachment.name}.`,
              });
            }
          }
        }

        // Save attachments to the conversation in the database
        if (uploadedAttachments.length > 0) {
          try {
            const conversationService = serviceRegistry.get("conversation");
            await conversationService.addAttachments({
              conversationId: currentConversationId,
              attachments: uploadedAttachments.map((att) => ({
                name: att.name,
                type: att.type,
                url: att.url,
              })),
            });

            userLogger.log(
              "[agent.ts] /stream: Saved attachments to conversation",
              {
                conversationId: currentConversationId,
                attachmentCount: uploadedAttachments.length,
              }
            );
          } catch (error) {
            logger.error("Failed to save attachments to conversation", error);
            // Don't fail the whole request if attachment saving fails
          }
        }
      }

      send({
        type: "unknown",
        content: "Uploaded attachments",
        metadata: {
          uploadedAttachments,
        },
      });

      const agentMessages = [
        ...messagesForAI,
        { role: "user" as const, content: userMessage.content },
      ];

      userLogger.log("[agent.ts] /stream inside streamSSE: [agentMessages]", {
        agentMessages,
      });

      // Use the AgentFlowService for autonomous loop - core part - we are creating agent in agentFactory that we will use going forward in this file
      const agent = await agentFactory.createAgent(agentType as any);
      userLogger.log("[agent.ts] /stream inside streamSSE: [agent created]", {
        about: agent.getMetadata(),
        agent,
      });

      // get agent registry
      const agentFlowService = serviceRegistry.get("agentFlow");
      agentFlowService.setSendFunction(send);

      let finalConclusion: string | null = null;
      try {
        finalConclusion = await agentFlowService.executeAutonomousFlow(
          {
            agentType: agentType as any,
            agent,
            userMessage: userMessage.content,
            conversationId: currentConversationId,
            userMessageId: sessionData.userMessageId || 0,
            conversationHistory: agentMessages,
            uploadedAttachments,
            sessionData, // Pass sessionData including contextData
          },
          {
            autonomousMode,
            maxRequests: 10,
            streamState: streamState!,
          }
        );
      } finally {
        agentFlowService.clearSendFunction();
      }

      // Send final conclusion
      await send({
        type: "finished",
        content: "Conversation ended",
        metadata: {
          conclusion: finalConclusion,
          agentType,
          agentStatus: serviceRegistry.get("agent").getStatus(),
        },
      });

      // Clean up
      serviceRegistry.get("stream").stopStream(token);
      serviceRegistry.get("agent").setStatus("waiting-for-prompt");
    } catch (error) {
      console.error("Stream error:", error);
      await send({
        type: "error",
        content: `An error occurred: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
      await send({
        type: "finished",
        content: "Conversation ended",
        metadata: {
          conclusion: null,
          agentType,
          agentStatus: serviceRegistry.get("agent").getStatus(),
          error: true,
        },
      });
      serviceRegistry.get("stream").stopStream(token);
      serviceRegistry.get("agent").setStatus("waiting-for-prompt");
    }
  });
});

// Mount the stream router on the agent router
agentRouter.route("/", streamRouter);
