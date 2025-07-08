import { createBaseAgent } from "../BaseAgent";
import { Agent, AgentMetadata } from "../agents.factory.types";

// Agent metadata - exported for dynamic discovery
export const testOpenRouterAgentMetadata: AgentMetadata = {
  id: "test-openrouter",
  type: "test-openrouter",
  name: "OpenRouter Test Agent",
  description:
    "Experimental agent for testing OpenRouter models and advanced features.",
  capabilities: ["openrouter_models", "experimental_features", "model_testing"],
  icon: "🧪",
  version: "1.0.0",
  author: "System",
};

export const createTestOpenRouterAgent = async (): Promise<Agent> => {
  const base = createBaseAgent({
    id: "test-openrouter",
    type: "test-openrouter",
    metadata: testOpenRouterAgentMetadata,
  });

  return {
    ...base,
    availableTools: [...base.availableTools],
    
    // Custom getMetadata that includes orchestration info
    getMetadata: () => ({
      ...testOpenRouterAgentMetadata,
      orchestration: {
        callable: true,
        canDelegate: false,
        costTier: "medium",
        estimatedDuration: 3000,
      },
    }),
    
    act: async (input) => {
      // For the general agent, we expect input to be an object with messages and tools
      // This allows it to handle the full LLM conversation flow
      if (typeof input === "object" && input.messages && input.tools) {
        const response = await base.llmService.runOpenRouterLLM({
          messages: input.messages,
          tools: input.tools,
        });
        // TODO: fix this
        return response as any;
      }

      // Fallback for simple string input (backward compatibility)
      const response = await base.llmService.runOpenRouterLLM({
        messages: [{ role: "user", content: input }],
        tools: [], // No tools for simple input
      });

      // TODO: fix this
      return response as any;
    },
  };
};