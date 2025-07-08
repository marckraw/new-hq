import { logger } from "@/utils/logger";
import { createConfigurableAgent } from "../configurable-agent.factory";
import { orchestratorConfig } from "./orchestrator.config";
import { getOrchestrationTools } from "../../tools/orchestration/orchestration-tools";
import { getAgentToolsFor } from "../../tools/agent-tool.factory";
import { unifiedToolRunnerService } from "../../../services/atoms/ToolRunnerService/unified-tool-runner.service";
import { Agent, AgentInput } from "../agents.factory.types";
import { agentRegistryService } from "../../services/AgentRegistryService/agent-registry.service";

/**
 * Creates an Orchestrator Agent that can coordinate other agents
 */
export const createOrchestratorAgent = (): Agent => {
  // Register orchestration tools
  const orchestrationTools = getOrchestrationTools();
  orchestrationTools.forEach(tool => {
    unifiedToolRunnerService.registerTool(tool);
  });
  
  // Custom handlers for the orchestrator
  const customHandlers: any = {
    // Load available agent tools dynamically
    loadAvailableAgentTools: async () => {
      const agentTools = getAgentToolsFor("orchestrator");
      return agentTools.map(tool => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      }));
    },
    
    // Validate orchestration plan
    validateOrchestrationPlan: async (plan: any) => {
      // Ensure all referenced agents exist
      const agentTypes = new Set<string>();
      
      if (plan.executions) {
        plan.executions.forEach((exec: any) => {
          if (exec.agent) agentTypes.add(exec.agent);
        });
      }
      
      if (plan.pipeline) {
        plan.pipeline.forEach((stage: any) => {
          if (stage.agent) agentTypes.add(stage.agent);
        });
      }
      
      for (const agentType of agentTypes) {
        const metadata = agentRegistryService.getMetadata(agentType as any);
        const exists = metadata !== null;
        if (!exists) {
          throw new Error(`Agent type '${agentType}' not found in registry`);
        }
      }
      
      return true;
    },
    
    // Transform the final response
    transformResponse: async (response: string, context: any) => {
      // Add execution metadata if available
      if (context.executionMetadata) {
        return `${response}\n\n---\n**Execution Metadata:**\n${JSON.stringify(context.executionMetadata, null, 2)}`;
      }
      return response;
    },
  };
  
  // Create the orchestrator using configurable agent factory
  const orchestrator = createConfigurableAgent({
    config: orchestratorConfig,
    customHandlers,
    additionalTools: {},
  });
  
  // Add getMetadata method
  orchestrator.getMetadata = () => orchestratorConfig.metadata;
  
  // Enhance the act method to add orchestration-specific logic
  const originalAct = orchestrator.act;
  orchestrator.act = async (input: AgentInput) => {
    logger.info("Orchestrator agent starting", {
      messageCount: input.messages.length,
      hasDelegationContext: !!input.context?.delegation,
    });
    
    // Add available agent tools to the tools list
    const availableAgentTools = await customHandlers.loadAvailableAgentTools();
    
    // Merge with orchestration tools
    const allTools = [
      ...orchestrationTools.map(tool => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object" as const,
            properties: {},
            required: [] as string[],
          },
        },
      })),
      ...availableAgentTools,
    ];
    
    // Create enhanced input with all tools
    const enhancedInput: AgentInput = {
      ...input,
      tools: allTools,
    };
    
    // Call original act method
    const response = await originalAct(enhancedInput);
    
    // Log orchestration summary
    if (response.tool_calls && response.tool_calls.length > 0) {
      const delegations = response.tool_calls.filter(tc => 
        tc.function.name.startsWith("delegate_to_") ||
        tc.function.name.startsWith("execute_agents_")
      );
      
      if (delegations.length > 0) {
        logger.info("Orchestration complete", {
          totalDelegations: delegations.length,
          delegationTypes: delegations.map(d => d.function.name),
        });
      }
    }
    
    return response;
  };
  
  return orchestrator;
};

// Register the orchestrator in the agent registry
export const registerOrchestratorAgent = () => {
  const orchestrator = createOrchestratorAgent();
  
  // Register the orchestrator
  agentRegistryService.register(orchestrator, orchestratorConfig);
  
  logger.info("Orchestrator agent registered");
};

// Export the metadata for use in the factory
export const orchestratorAgentMetadata = orchestratorConfig.metadata;