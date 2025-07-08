import { z } from "@hono/zod-openapi";
import { logger } from "@/utils/logger";
import { AgentType, Agent, AgentInput } from "../factories/agents.factory.types";
import { agentFactory } from "../factories/agents.factory";
import { agentRegistryService } from "../services/AgentRegistryService/agent-registry.service";
import { UnifiedTool, ToolContext, ToolResult } from "./unified-tool.types";

// Maximum delegation depth to prevent infinite loops
const MAX_DELEGATION_DEPTH = 5;

// Agent tool input schema
const AgentToolInputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })),
  // Additional context can be passed
  context: z.any().optional(),
});

/**
 * Creates a UnifiedTool wrapper for an agent, allowing it to be called by other agents
 */
export const createAgentTool = (agentType: AgentType): UnifiedTool => {
  // Get agent metadata from registry
  const metadata = agentRegistryService.getMetadata(agentType);
  const config = agentRegistryService.getConfig(agentType);
  
  if (!metadata) {
    throw new Error(`Agent ${agentType} not found in registry`);
  }
  
  return {
    name: `delegate_to_${agentType}`,
    description: `Delegate task to ${metadata.name}: ${metadata.description}`,
    version: metadata.version,
    
    source: "agent",
    sourceMetadata: {
      agentType,
      agentCapabilities: metadata.capabilities,
      estimatedDuration: config?.orchestration?.estimatedDuration,
      costTier: config?.orchestration?.costTier || "medium",
    },
    
    parameters: AgentToolInputSchema,
    
    execute: async (input: z.infer<typeof AgentToolInputSchema>, context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();
      
      try {
        // Check delegation depth
        const currentDepth = context.delegation?.delegationDepth || 0;
        if (currentDepth >= MAX_DELEGATION_DEPTH) {
          return {
            success: false,
            error: {
              code: "MAX_DELEGATION_DEPTH",
              message: `Maximum delegation depth (${MAX_DELEGATION_DEPTH}) reached`,
              details: {
                delegationPath: context.delegation?.delegationPath,
                currentDepth,
              },
            },
          };
        }
        
        // Check if delegation is allowed
        if (context.delegation?.fromAgent) {
          const canCall = agentRegistryService.canCall(context.delegation.fromAgent, agentType);
          if (!canCall) {
            return {
              success: false,
              error: {
                code: "DELEGATION_NOT_ALLOWED",
                message: `Agent ${context.delegation.fromAgent} is not allowed to call ${agentType}`,
              },
            };
          }
        }
        
        // Create or get the agent
        let agent: Agent;
        const registeredAgent = agentRegistryService.get(agentType);
        
        if (registeredAgent) {
          agent = registeredAgent;
        } else {
          // Fallback to factory if not in registry
          agent = await agentFactory.createAgent(agentType);
        }
        
        // Prepare agent input with delegation context
        const agentInput: AgentInput = {
          messages: input.messages,
          context: {
            ...(input.context || {}),
            conversationId: context.conversationId,
            // Add delegation to the context
            ...({
              delegation: {
                fromAgent: context.delegation?.fromAgent || "general" as AgentType,
                delegationDepth: currentDepth + 1,
                sharedContext: context.delegation?.sharedContext || undefined,
                parentExecutionId: context.executionId || "root",
                delegationPath: [
                  ...(context.delegation?.delegationPath || []),
                  agentType,
                ],
              },
            }),
          },
        };
        
        logger.info(`Delegating to agent ${agentType}`, {
          fromAgent: context.delegation?.fromAgent,
          depth: currentDepth + 1,
          path: [...(context.delegation?.delegationPath || []), agentType],
        });
        
        // Execute the agent
        const response = await agent.act(agentInput);
        
        const executionTime = Date.now() - startTime;
        
        return {
          success: true,
          data: response.content, // Extract just the content string from the agent response
          metadata: {
            executionTime,
            // TODO: Add token counting if available
          },
        };
        
      } catch (error) {
        logger.error(`Error executing agent tool ${agentType}`, error);
        
        return {
          success: false,
          error: {
            code: "AGENT_EXECUTION_ERROR",
            message: `Failed to execute agent ${agentType}`,
            details: error,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      }
    },
    
    // Validation
    validate: async (input: unknown) => {
      const result = AgentToolInputSchema.safeParse(input);
      if (result.success) {
        return { valid: true };
      }
      return {
        valid: false,
        errors: result.error.issues.map(issue => issue.message),
      };
    },
    
    // Cost estimation based on agent config
    estimateCost: async (input) => {
      const costTier = config?.orchestration?.costTier || "medium";
      const messageCount = input.messages.length;
      const estimatedTokens = messageCount * 100; // Rough estimate
      
      const costMultiplier = {
        low: 0.5,
        medium: 1.0,
        high: 2.0,
      };
      
      return {
        tokens: estimatedTokens,
        cost: estimatedTokens * 0.0001 * costMultiplier[costTier], // Example pricing
      };
    },
    
    // Check if execution is allowed
    canExecute: async (context) => {
      // Check delegation permissions
      if (context.delegation?.fromAgent) {
        const allowed = agentRegistryService.canCall(context.delegation.fromAgent, agentType);
        if (!allowed) {
          return {
            allowed: false,
            reason: `Agent ${context.delegation.fromAgent} cannot delegate to ${agentType}`,
          };
        }
      }
      
      // Check depth limit
      if (context.delegation && context.delegation.delegationDepth >= MAX_DELEGATION_DEPTH) {
        return {
          allowed: false,
          reason: `Maximum delegation depth reached (${MAX_DELEGATION_DEPTH})`,
        };
      }
      
      return { allowed: true };
    },
  };
};

/**
 * Create agent tools for all callable agents in the registry
 */
export const createAllAgentTools = (): UnifiedTool[] => {
  const callableAgents = agentRegistryService.discover({
    includeCallable: true,
  });
  
  return callableAgents.map(agentType => createAgentTool(agentType));
};

/**
 * Create agent tools for specific agent types
 */
export const createAgentToolsForTypes = (agentTypes: AgentType[]): UnifiedTool[] => {
  return agentTypes
    .filter(type => {
      const config = agentRegistryService.getConfig(type);
      return config?.orchestration?.callable !== false;
    })
    .map(type => createAgentTool(type));
};

/**
 * Get agent tools that a specific agent can use
 */
export const getAgentToolsFor = (callerAgent: AgentType): UnifiedTool[] => {
  const config = agentRegistryService.getConfig(callerAgent);
  
  if (!config?.orchestration?.canDelegate) {
    return [];
  }
  
  const allowedDelegates = config.orchestration.allowedDelegates;
  if (!allowedDelegates) {
    // Can delegate to any callable agent except itself
    return createAllAgentTools().filter(
      tool => tool.sourceMetadata?.agentType !== callerAgent
    );
  }
  
  // Only create tools for allowed delegates
  return createAgentToolsForTypes(allowedDelegates);
};