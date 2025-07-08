import { z } from "@hono/zod-openapi";
import { logger } from "@/utils/logger";
import { ToolContext, ToolResult, CategorizedTool } from "../unified-tool.types";
import { agentRegistryService } from "../../services/AgentRegistryService/agent-registry.service";
import { unifiedToolRunnerService } from "../../../services/atoms/ToolRunnerService/unified-tool-runner.service";

/**
 * Analyzes a task to determine required capabilities and orchestration strategy
 */
export const createAnalyzeTaskTool = (): CategorizedTool => {
  const inputSchema = z.object({
    task: z.string().describe("The task to analyze"),
    constraints: z.object({
      timeLimit: z.number().optional(),
      costLimit: z.number().optional(),
      qualityRequirement: z.enum(["fast", "balanced", "high"]).optional(),
    }).optional(),
  });
  
  return {
    name: "analyze_task",
    description: "Analyze a task to determine required capabilities and orchestration strategy",
    category: "orchestration",
    source: "local",
    parameters: inputSchema,
    
    execute: async (input: z.infer<typeof inputSchema>, _context: ToolContext): Promise<ToolResult> => {
      try {
        // Analyze task complexity and requirements
        const taskAnalysis = {
          complexity: analyzeComplexity(input.task),
          requiredCapabilities: extractRequiredCapabilities(input.task),
          suggestedStrategy: determineBestStrategy(input.task),
          estimatedSteps: estimateSteps(input.task),
        };
        
        return {
          success: true,
          data: taskAnalysis,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: "TASK_ANALYSIS_ERROR",
            message: "Failed to analyze task",
            details: error,
          },
        };
      }
    },
  };
};

/**
 * Gets capabilities of available agents
 */
export const createGetAgentCapabilitiesTool = (): CategorizedTool => {
  const inputSchema = z.object({
    capability: z.string().optional().describe("Filter by specific capability"),
    includeCallable: z.boolean().optional().default(true),
  });
  
  return {
    name: "get_agent_capabilities",
    description: "Get information about available agents and their capabilities",
    category: "orchestration",
    source: "local",
    parameters: inputSchema,
    
    execute: async (input: z.infer<typeof inputSchema>): Promise<ToolResult> => {
      try {
        const agents = agentRegistryService.discover({
          capabilities: input.capability ? [input.capability as any] : undefined,
          includeCallable: input.includeCallable,
        });
        
        const agentInfo = agents.map(agentType => {
          const metadata = agentRegistryService.getMetadata(agentType);
          const config = agentRegistryService.getConfig(agentType);
          
          return {
            type: agentType,
            name: metadata?.name,
            description: metadata?.description,
            capabilities: metadata?.capabilities,
            estimatedDuration: config?.orchestration?.estimatedDuration,
            costTier: config?.orchestration?.costTier,
          };
        });
        
        return {
          success: true,
          data: agentInfo,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: "CAPABILITY_QUERY_ERROR",
            message: "Failed to get agent capabilities",
            details: error,
          },
        };
      }
    },
  };
};

/**
 * Execute multiple agents in parallel
 */
export const createExecuteAgentsParallelTool = (): CategorizedTool => {
  const inputSchema = z.object({
    executions: z.array(z.object({
      agent: z.string().describe("Agent type to execute"),
      task: z.string().describe("Task for the agent"),
      context: z.any().optional(),
    })).min(1).max(10),
    timeout: z.number().optional().default(30000),
  });
  
  return {
    name: "execute_agents_parallel",
    description: "Execute multiple agents in parallel for independent tasks",
    category: "orchestration",
    source: "local",
    parameters: inputSchema,
    
    execute: async (
      input: z.infer<typeof inputSchema>, 
      context: ToolContext
    ): Promise<ToolResult> => {
      const startTime = Date.now();
      
      try {
        logger.info("Executing agents in parallel", {
          agentCount: input.executions.length,
          agents: input.executions.map(e => e.agent),
        });
        
        // Execute all agents in parallel
        const promises = input.executions.map(async (execution) => {
          const toolName = `delegate_to_${execution.agent}`;
          
          try {
            const result = await unifiedToolRunnerService.executeTool(
              toolName,
              {
                messages: [
                  { role: "user" as const, content: execution.task }
                ],
                context: execution.context,
              },
              context,
              { timeout: input.timeout }
            );
            
            return {
              agent: execution.agent,
              status: "success" as const,
              result: result.success ? result.data : undefined,
              error: result.error?.message,
              executionTime: result.metadata?.executionTime || 0,
            };
          } catch (error) {
            return {
              agent: execution.agent,
              status: "failure" as const,
              error: error instanceof Error ? error.message : String(error),
              executionTime: Date.now() - startTime,
            };
          }
        });
        
        const results = await Promise.all(promises);
        
        return {
          success: true,
          data: {
            executions: results,
            totalExecutionTime: Date.now() - startTime,
            successCount: results.filter(r => r.status === "success").length,
            failureCount: results.filter(r => r.status === "failure").length,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
        
      } catch (error) {
        logger.error("Parallel execution failed", error);
        
        return {
          success: false,
          error: {
            code: "PARALLEL_EXECUTION_ERROR",
            message: "Failed to execute agents in parallel",
            details: error,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      }
    },
  };
};

/**
 * Execute agents in a pipeline (sequential with data passing)
 */
export const createExecuteAgentsPipelineTool = (): CategorizedTool => {
  const inputSchema = z.object({
    pipeline: z.array(z.object({
      agent: z.string().describe("Agent type to execute"),
      task: z.string().describe("Task template (can use {{previousResult}})"),
      transformResult: z.boolean().optional().describe("Transform result before passing to next"),
    })).min(2).max(10),
    initialInput: z.string().describe("Initial input for the pipeline"),
    timeout: z.number().optional().default(60000),
  });
  
  return {
    name: "execute_agents_pipeline",
    description: "Execute agents sequentially, passing results between them",
    category: "orchestration",
    source: "local",
    parameters: inputSchema,
    
    execute: async (
      input: z.infer<typeof inputSchema>, 
      context: ToolContext
    ): Promise<ToolResult> => {
      const startTime = Date.now();
      const executionResults = [];
      let currentInput = input.initialInput;
      
      try {
        logger.info("Executing agent pipeline", {
          stages: input.pipeline.length,
          agents: input.pipeline.map(p => p.agent),
        });
        
        for (const [index, stage] of input.pipeline.entries()) {
          const toolName = `delegate_to_${stage.agent}`;
          
          // Replace {{previousResult}} with actual result
          const task = stage.task.replace("{{previousResult}}", currentInput);
          
          logger.info(`Pipeline stage ${index + 1}/${input.pipeline.length}`, {
            agent: stage.agent,
            taskPreview: task.slice(0, 100),
          });
          
          const result = await unifiedToolRunnerService.executeTool(
            toolName,
            {
              messages: [
                { role: "user" as const, content: task }
              ],
            },
            context,
            { timeout: input.timeout }
          );
          
          if (!result.success) {
            executionResults.push({
              agent: stage.agent,
              status: "failure",
              error: result.error?.message,
              executionTime: result.metadata?.executionTime || 0,
            });
            
            // Pipeline failed at this stage
            return {
              success: false,
              error: {
                code: "PIPELINE_STAGE_FAILED",
                message: `Pipeline failed at stage ${index + 1} (${stage.agent})`,
                details: {
                  failedStage: stage.agent,
                  error: result.error,
                  executionResults,
                },
              },
              metadata: {
                executionTime: Date.now() - startTime,
              },
            };
          }
          
          // Success - prepare for next stage
          executionResults.push({
            agent: stage.agent,
            status: "success",
            result: result.data,
            executionTime: result.metadata?.executionTime || 0,
          });
          
          // Update input for next stage
          currentInput = stage.transformResult ? 
            JSON.stringify(result.data) : 
            result.data?.content || result.data?.response || JSON.stringify(result.data);
        }
        
        return {
          success: true,
          data: {
            pipeline: input.pipeline,
            executions: executionResults,
            finalResult: currentInput,
            totalExecutionTime: Date.now() - startTime,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
        
      } catch (error) {
        logger.error("Pipeline execution failed", error);
        
        return {
          success: false,
          error: {
            code: "PIPELINE_EXECUTION_ERROR",
            message: "Failed to execute pipeline",
            details: error,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      }
    },
  };
};

/**
 * Route to a specific agent based on conditions
 */
export const createRouteToAgentTool = (): CategorizedTool => {
  const inputSchema = z.object({
    task: z.string().describe("Task to route"),
    routing: z.array(z.object({
      condition: z.string().describe("Condition to check (e.g., 'contains:research')"),
      agent: z.string().describe("Agent to route to if condition matches"),
    })),
    defaultAgent: z.string().describe("Default agent if no conditions match"),
  });
  
  return {
    name: "route_to_agent",
    description: "Conditionally route a task to an appropriate agent",
    category: "orchestration",
    source: "local",
    parameters: inputSchema,
    
    execute: async (
      input: z.infer<typeof inputSchema>, 
      context: ToolContext
    ): Promise<ToolResult> => {
      try {
        // Check conditions
        let selectedAgent = input.defaultAgent;
        
        for (const route of input.routing) {
          if (checkCondition(input.task, route.condition)) {
            selectedAgent = route.agent;
            break;
          }
        }
        
        logger.info("Routing task to agent", {
          selectedAgent,
          task: input.task.slice(0, 100),
        });
        
        // Execute the selected agent
        const toolName = `delegate_to_${selectedAgent}`;
        const result = await unifiedToolRunnerService.executeTool(
          toolName,
          {
            messages: [
              { role: "user" as const, content: input.task }
            ],
          },
          context
        );
        
        return {
          success: result.success,
          data: {
            routedTo: selectedAgent,
            result: result.data,
          },
          error: result.error,
          metadata: result.metadata,
        };
        
      } catch (error) {
        return {
          success: false,
          error: {
            code: "ROUTING_ERROR",
            message: "Failed to route to agent",
            details: error,
          },
        };
      }
    },
  };
};

/**
 * Synthesize results from multiple agents
 */
export const createSynthesizeResultsTool = (): CategorizedTool => {
  const inputSchema = z.object({
    results: z.array(z.object({
      agent: z.string(),
      result: z.any(),
    })),
    synthesisStrategy: z.enum(["merge", "summarize", "consensus", "best"]).optional().default("merge"),
    userContext: z.string().optional().describe("Original user request for context"),
  });
  
  return {
    name: "synthesize_results",
    description: "Synthesize results from multiple agent executions",
    category: "orchestration",
    source: "local",
    parameters: inputSchema,
    
    execute: async (input: z.infer<typeof inputSchema>): Promise<ToolResult> => {
      try {
        let synthesis: any;
        
        switch (input.synthesisStrategy) {
          case "merge":
            // Merge all results into a single object/array
            synthesis = mergeResults(input.results);
            break;
            
          case "summarize":
            // Create a summary of all results
            synthesis = summarizeResults(input.results, input.userContext);
            break;
            
          case "consensus":
            // Find consensus among results
            synthesis = findConsensus(input.results);
            break;
            
          case "best":
            // Select the best result based on quality metrics
            synthesis = selectBestResult(input.results);
            break;
            
          default:
            synthesis = input.results;
        }
        
        return {
          success: true,
          data: {
            synthesis,
            strategy: input.synthesisStrategy,
            sourceCount: input.results.length,
          },
        };
        
      } catch (error) {
        return {
          success: false,
          error: {
            code: "SYNTHESIS_ERROR",
            message: "Failed to synthesize results",
            details: error,
          },
        };
      }
    },
  };
};

// Helper functions
function analyzeComplexity(task: string): "simple" | "moderate" | "complex" {
  const indicators = {
    simple: ["what", "when", "where", "list", "find"],
    moderate: ["how", "why", "compare", "analyze", "explain"],
    complex: ["create", "design", "implement", "optimize", "integrate"],
  };
  
  const taskLower = task.toLowerCase();
  
  for (const [complexity, keywords] of Object.entries(indicators)) {
    if (keywords.some(keyword => taskLower.includes(keyword))) {
      return complexity as "simple" | "moderate" | "complex";
    }
  }
  
  return "moderate";
}

function extractRequiredCapabilities(task: string): string[] {
  const capabilityMap: Record<string, string[]> = {
    "content-generation": ["write", "create", "compose", "draft"],
    "analysis": ["analyze", "examine", "investigate", "research"],
    "code-generation": ["code", "implement", "program", "develop"],
    "visual-design": ["design", "figma", "layout", "ui", "ux"],
    "data-processing": ["data", "process", "transform", "extract"],
  };
  
  const taskLower = task.toLowerCase();
  const capabilities: string[] = [];
  
  for (const [capability, keywords] of Object.entries(capabilityMap)) {
    if (keywords.some(keyword => taskLower.includes(keyword))) {
      capabilities.push(capability);
    }
  }
  
  return capabilities.length > 0 ? capabilities : ["general"];
}

function determineBestStrategy(task: string): "parallel" | "pipeline" | "conditional" | "hybrid" {
  const taskLower = task.toLowerCase();
  
  if (taskLower.includes("and then") || taskLower.includes("followed by")) {
    return "pipeline";
  }
  
  if (taskLower.includes("if") || taskLower.includes("depending on")) {
    return "conditional";
  }
  
  if (taskLower.includes("and") && taskLower.includes("compare")) {
    return "parallel";
  }
  
  return "hybrid";
}

function estimateSteps(task: string): number {
  // Simple heuristic based on task complexity
  const sentences = task.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const hasMultipleParts = task.includes(" and ") || task.includes(", ");
  
  return Math.min(sentences.length + (hasMultipleParts ? 1 : 0), 5);
}

function checkCondition(task: string, condition: string): boolean {
  const parts = condition.split(":");
  if (parts.length < 2) return false;
  
  const [type, ...valueParts] = parts;
  const value = valueParts.join(":"); // Handle colons in value
  const taskLower = task.toLowerCase();
  
  switch (type) {
    case "contains":
      return taskLower.includes(value.toLowerCase());
    case "startsWith":
      return taskLower.startsWith(value.toLowerCase());
    case "matches":
      try {
        return new RegExp(value, "i").test(task);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function mergeResults(results: Array<{ agent: string; result?: any }>): any {
  // Simple merge strategy - combine all results
  return results.reduce((acc, { agent, result }) => {
    acc[agent] = result;
    return acc;
  }, {} as Record<string, any>);
}

function summarizeResults(
  results: Array<{ agent: string; result?: any }>, 
  context?: string
): string {
  // Create a text summary of all results
  let summary = context ? `Based on the request: "${context}"\n\n` : "";
  
  results.forEach(({ agent, result }) => {
    summary += `**${agent} Results:**\n`;
    summary += typeof result === "string" ? result : JSON.stringify(result, null, 2);
    summary += "\n\n";
  });
  
  return summary.trim();
}

function findConsensus(results: Array<{ agent: string; result?: any }>): any {
  // Find common elements across results
  // This is a simplified implementation
  return {
    consensus: "Multiple agents agree on the approach",
    results: results,
  };
}

function selectBestResult(results: Array<{ agent: string; result?: any }>): any {
  // Select based on some quality metric (simplified)
  // In reality, this would use more sophisticated scoring
  return results[0]?.result || null;
}

/**
 * Get all orchestration tools
 */
export const getOrchestrationTools = (): CategorizedTool[] => {
  return [
    createAnalyzeTaskTool(),
    createGetAgentCapabilitiesTool(),
    createExecuteAgentsParallelTool(),
    createExecuteAgentsPipelineTool(),
    createRouteToAgentTool(),
    createSynthesizeResultsTool(),
  ];
};