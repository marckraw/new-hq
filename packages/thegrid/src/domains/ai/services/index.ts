import { serviceRegistry } from "../../../registry/service-registry";

// ✅ Modern ES module imports with proper types
import { createLLMService } from "./LLMService/llm.service";
import { conversationService } from "./ConversationService/conversation.service";
import { memoryService } from "./MemoryService/memory.service";
import { decisionMakerService } from "./DecisionMakerService/decision-maker.service";
import { langfuseService } from "../../../services/atoms/LangfuseService/langfuse.service";

import type { LLMService } from "./LLMService/llm.service";
import type { ConversationService } from "./ConversationService/conversation.service";
import type { MemoryService } from "./MemoryService/memory.service";
import type { DecisionMakerService } from "./DecisionMakerService/decision-maker.service";
import type { LangfuseService } from "../../../services/atoms/LangfuseService/langfuse.service";

// Register AI services
const registerAIServices = () => {
  // ✅ Register LLM service (eager loading - core service)
  serviceRegistry.register("llm", () =>
    createLLMService({ dangerouslyAllowBrowser: false })
  );

  // TODO: Register other AI services
  serviceRegistry.register("conversation", () => conversationService);
  serviceRegistry.register("memory", () => memoryService);
  serviceRegistry.register("decisionMaker", () => decisionMakerService);
  serviceRegistry.register("langfuse", () => langfuseService);
};

// Domain-specific service accessors (functional style)
const createAIServices = () => {
  return {
    llm: () => createLLMService({ dangerouslyAllowBrowser: false }),
    conversation: () => conversationService,
    memory: () => memoryService,
    decisionMaker: () => decisionMakerService,
    langfuse: () => langfuseService,
  };
};

// Initialize services on import
registerAIServices();

// Export domain services
export const aiServices = createAIServices();

// Individual exports for convenience
export const { llm, conversation, memory, decisionMaker, langfuse } =
  aiServices;

// Type exports
export type AIServices = {
  llm: LLMService;
  conversation: ConversationService;
  memory: MemoryService;
  decisionMaker: DecisionMakerService;
  langfuse: LangfuseService;
};
