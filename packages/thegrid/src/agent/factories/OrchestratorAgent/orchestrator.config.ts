import { z } from "@hono/zod-openapi";
import { AgentConfig } from "../../schemas/agent-config.schemas";
import { AgentTypeSchema } from "../../../schemas/agent-base.schemas";

/**
 * Configuration for the Orchestrator Agent
 * This agent coordinates other agents to complete complex tasks
 */
export const orchestratorConfig: AgentConfig = {
  id: "orchestrator",
  type: AgentTypeSchema.Enum.orchestrator,
  version: "1.0.0",
  
  metadata: {
    type: "orchestrator" as const,
    id: "orchestrator",
    name: "Orchestrator",
    description: "Coordinates multiple agents to complete complex tasks",
    version: "1.0.0",
    icon: "🎭",
    capabilities: [
      "task_analysis" as const,
      "agent_coordination" as const,
      "parallel_execution" as const,
      "pipeline_execution" as const,
      "result_synthesis" as const,
    ],
  },
  
  prompts: {
    system: `You are an Orchestrator Agent responsible for analyzing tasks and coordinating other agents to complete them efficiently.

Your capabilities:
1. Analyze complex tasks and break them down into subtasks
2. Identify which agents are best suited for each subtask
3. Coordinate agent execution (parallel, sequential, or conditional)
4. Aggregate and synthesize results from multiple agents
5. Handle errors and implement fallback strategies

Available delegation patterns:
- **Parallel execution**: Run multiple agents simultaneously for independent tasks
- **Pipeline execution**: Chain agents where output of one feeds into the next
- **Conditional routing**: Choose agents based on task analysis
- **Consensus gathering**: Get multiple perspectives and synthesize

When orchestrating:
1. First analyze the task to understand requirements
2. Identify the capabilities needed
3. Select appropriate agents and execution pattern
4. Monitor execution and handle failures
5. Synthesize results into a coherent response

Always explain your orchestration plan before executing it.`,
  },
  
  behavior: {
    maxRetries: 2,
    responseFormat: "text" as const,
    validateResponse: false,
    timeout: 60000, // 60 seconds for complex orchestrations
  },
  
  tools: {
    builtin: [], // Will be populated dynamically with agent tools
    mcp: [],
    custom: [
      "analyze_task",
      "get_agent_capabilities", 
      "execute_agents_parallel",
      "execute_agents_pipeline",
      "route_to_agent",
      "synthesize_results",
    ],
  },
  
  orchestration: {
    callable: true,
    canDelegate: true,
    allowedDelegates: [], // Can delegate to any agent
    estimatedDuration: 30000, // 30 seconds
    costTier: "medium",
  },
  
  // Mark hooks as enabled (actual implementation in the factory)
  hooks: {
    beforeAct: true,
    afterResponse: true,
  },
  
  // Custom config for orchestrator-specific behaviors
  customConfig: {
    parallelExecutionEnabled: true,
    maxParallelAgents: 5,
    delegationDepthLimit: 3,
    retryFailedDelegations: true,
    requirePlanApproval: false,
    showExecutionProgress: true,
  },
};

// Orchestration result schema
export const OrchestrationResultSchema = z.object({
  plan: z.object({
    strategy: z.enum(["parallel", "pipeline", "conditional", "hybrid"]),
    steps: z.array(z.object({
      agent: z.string(),
      task: z.string(),
      dependencies: z.array(z.string()).optional(),
    })),
  }),
  
  executions: z.array(z.object({
    agent: z.string(),
    status: z.enum(["success", "failure", "skipped"]),
    result: z.any().optional(),
    error: z.string().optional(),
    executionTime: z.number(),
  })),
  
  synthesis: z.string(),
  
  metadata: z.object({
    totalExecutionTime: z.number(),
    agentsUsed: z.number(),
    tokensConsumed: z.number().optional(),
    cost: z.number().optional(),
  }),
});

export type OrchestrationResult = z.infer<typeof OrchestrationResultSchema>;