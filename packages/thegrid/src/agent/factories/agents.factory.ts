import {
  Agent,
  AgentType,
  AgentFactory,
  AgentMetadata,
  AgentInitializationError,
} from "./agents.factory.types";
import { createGeneralAgent, generalAgentMetadata } from "./GeneralAgent";
import { scribeAgentMetadata } from "./ScribeAgent/scribe.config";
import {
  createConfigBasedRephraserAgent,
  rephraserAgentMetadata,
} from "./RephraserAgent/rephraser.config";
import {
  createTestOpenRouterAgent,
  testOpenRouterAgentMetadata,
} from "./TestOpenRouteAgent";
import {
  createFigmaToStoryblokAgent,
  figmaToStoryblokAgentMetadata,
} from "./FigmaToStoryblokAgent";
import {
  createIRFArchitectAgent,
  irfArchitectAgentMetadata,
} from "./IRFArchitectAgent";
import {
  createStoryblokEditorAgent,
  storyblokEditorAgentMetadata,
} from "./StoryblokEditorAgent";
import { createConfigBasedScribeAgent } from "./ScribeAgent/scribe.config";
import {
  createOrchestratorAgent,
} from "./OrchestratorAgent";
import {
  createSiteBuilderAgent,
  siteBuilderAgentMetadata,
} from "./SiteBuilderAgent";

// Dynamic agent registry - metadata is now imported from each agent
const AGENT_REGISTRY = {
  general: {
    createAgent: createGeneralAgent,
    metadata: generalAgentMetadata,
  },
  "test-openrouter": {
    createAgent: createTestOpenRouterAgent,
    metadata: testOpenRouterAgentMetadata,
  },
  scribe: {
    createAgent: createConfigBasedScribeAgent,
    metadata: scribeAgentMetadata,
  },
  rephraser: {
    createAgent: createConfigBasedRephraserAgent,
    metadata: rephraserAgentMetadata,
  },
  "figma-to-storyblok": {
    createAgent: createFigmaToStoryblokAgent,
    metadata: figmaToStoryblokAgentMetadata,
  },
  "irf-architect": {
    createAgent: createIRFArchitectAgent,
    metadata: irfArchitectAgentMetadata,
  },
  "storyblok-editor": {
    createAgent: createStoryblokEditorAgent,
    metadata: storyblokEditorAgentMetadata,
  },
  orchestrator: {
    createAgent: createOrchestratorAgent,
    metadata: {
      type: "orchestrator" as const,
      id: "orchestrator",
      name: "Orchestrator",
      description: "Coordinates multiple agents to complete complex tasks",
      version: "1.0.0",
      icon: "🎭",
      capabilities: [
        "task_analysis",
        "agent_coordination",
        "parallel_execution",
        "pipeline_execution",
        "result_synthesis",
      ] as ("task_analysis" | "agent_coordination" | "parallel_execution" | "pipeline_execution" | "result_synthesis")[],
    },
  },
  "site-builder": {
    createAgent: createSiteBuilderAgent,
    metadata: siteBuilderAgentMetadata,
  },
} as const;

// --- Factory Creator ---
export const createAgentFactory = (): AgentFactory => {
  const createAgent = async (type: AgentType): Promise<Agent> => {
    try {
      // TODO: fix this
      // @ts-ignore
      const agentConfig = AGENT_REGISTRY[type];
      if (!agentConfig) {
        throw new AgentInitializationError(
          type,
          type,
          new Error(`Unknown agent type: ${type}`)
        );
      }

      return await agentConfig.createAgent();
    } catch (error) {
      if (error instanceof AgentInitializationError) {
        throw error;
      }
      throw new AgentInitializationError(type, type, error as Error);
    }
  };

  const getSupportedTypes = (): AgentType[] => {
    return Object.keys(AGENT_REGISTRY) as AgentType[];
  };

  const getAgentMetadata = (type: AgentType): AgentMetadata | null => {
    // TODO: fix this
    // @ts-ignore
    const agentConfig = AGENT_REGISTRY[type];
    return agentConfig?.metadata || null;
  };

  const getAllAgentMetadata = (): AgentMetadata[] => {
    return Object.values(AGENT_REGISTRY).map((config) => config.metadata);
  };

  return {
    createAgent,
    getSupportedTypes,
    getAgentMetadata,
    getAllAgentMetadata,
  };
};

export const agentFactory = createAgentFactory();
