import { logger } from "@/utils/logger";
import type OpenAI from "openai";
import { UnifiedTool, ToolContext, ToolResult, ToolExecutionOptions } from "../../../agent/tools/unified-tool.types";
import { createAgentTool } from "../../../agent/tools/agent-tool.factory";
import { AgentType } from "../../../agent/factories/agents.factory.types";
import { toolRunnerService } from "./toolRunner.service";

// Tool registry for unified tools
interface ToolRegistry {
  local: Map<string, UnifiedTool>;
  mcp: Map<string, UnifiedTool>;
  agent: Map<string, UnifiedTool>;
  external: Map<string, UnifiedTool>;
}

/**
 * Enhanced tool runner service that supports the unified tool interface
 */
export const createUnifiedToolRunnerService = () => {
  // Private tool registry
  const registry: ToolRegistry = {
    local: new Map(),
    mcp: new Map(),
    agent: new Map(),
    external: new Map(),
  };
  
  // Track tool usage statistics
  const usageStats = new Map<string, {
    count: number;
    totalTime: number;
    successCount: number;
    failureCount: number;
  }>();
  
  /**
   * Register a unified tool
   */
  const registerTool = (tool: UnifiedTool) => {
    const registryMap = registry[tool.source];
    registryMap.set(tool.name, tool);
    
    logger.info(`Registered ${tool.source} tool: ${tool.name}`);
  };
  
  /**
   * Register multiple tools
   */
  const registerTools = (tools: UnifiedTool[]) => {
    tools.forEach(tool => registerTool(tool));
  };
  
  /**
   * Get a tool by name and optional source
   */
  const getTool = (name: string, source?: string): UnifiedTool | null => {
    if (source) {
      return registry[source as keyof ToolRegistry]?.get(name) || null;
    }
    
    // Search all registries
    for (const [_, toolMap] of Object.entries(registry)) {
      if (toolMap.has(name)) {
        return toolMap.get(name)!;
      }
    }
    
    return null;
  };
  
  /**
   * List all available tools
   */
  const listTools = (source?: string): UnifiedTool[] => {
    if (source) {
      return Array.from(registry[source as keyof ToolRegistry]?.values() || []);
    }
    
    const allTools: UnifiedTool[] = [];
    for (const toolMap of Object.values(registry)) {
      allTools.push(...Array.from(toolMap.values() as Iterable<UnifiedTool>));
    }
    
    return allTools;
  };
  
  /**
   * Execute a unified tool
   */
  const executeTool = async (
    toolName: string,
    input: any,
    context: ToolContext,
    options: ToolExecutionOptions = {}
  ): Promise<ToolResult> => {
    const startTime = Date.now();
    const tool = getTool(toolName);
    
    if (!tool) {
      return {
        success: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool ${toolName} not found`,
        },
      };
    }
    
    try {
      // Check if execution is allowed
      if (tool.canExecute) {
        const canExecute = await tool.canExecute(context);
        if (!canExecute.allowed) {
          return {
            success: false,
            error: {
              code: "EXECUTION_NOT_ALLOWED",
              message: canExecute.reason || "Tool execution not allowed",
            },
          };
        }
      }
      
      // Validate input if validator exists
      if (tool.validate) {
        const validation = await tool.validate(input);
        if (!validation.valid) {
          return {
            success: false,
            error: {
              code: "INVALID_INPUT",
              message: "Tool input validation failed",
              details: validation.errors,
            },
          };
        }
      }
      
      // Execute with timeout if specified
      let result: ToolResult;
      if (options.timeout) {
        result = await executeWithTimeout(
          () => tool.execute(input, context),
          options.timeout
        );
      } else {
        result = await tool.execute(input, context);
      }
      
      // Update usage statistics
      updateUsageStats(toolName, {
        success: result.success,
        executionTime: Date.now() - startTime,
      });
      
      return result;
      
    } catch (error) {
      logger.error(`Error executing tool ${toolName}`, error);
      
      updateUsageStats(toolName, {
        success: false,
        executionTime: Date.now() - startTime,
      });
      
      if (options.throwOnError) {
        throw error;
      }
      
      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: `Tool execution failed: ${error}`,
          details: error,
        },
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    }
  };
  
  /**
   * Execute tool with timeout
   */
  const executeWithTimeout = async <T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> => {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
      ),
    ]);
  };
  
  /**
   * Update usage statistics
   */
  const updateUsageStats = (toolName: string, result: {
    success: boolean;
    executionTime: number;
  }) => {
    const stats = usageStats.get(toolName) || {
      count: 0,
      totalTime: 0,
      successCount: 0,
      failureCount: 0,
    };
    
    stats.count++;
    stats.totalTime += result.executionTime;
    if (result.success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }
    
    usageStats.set(toolName, stats);
  };
  
  /**
   * Get usage statistics for a tool
   */
  const getUsageStats = (toolName: string) => {
    const stats = usageStats.get(toolName);
    if (!stats) return null;
    
    return {
      ...stats,
      averageExecutionTime: stats.totalTime / stats.count,
      successRate: stats.successCount / stats.count,
    };
  };
  
  /**
   * Convert legacy tool call to unified execution
   */
  const runLegacyTool = async (
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    userMessage: string,
    context: ToolContext
  ): Promise<ToolResult> => {
    const toolName = toolCall.function.name;
    
    // Check if it's a registered unified tool
    const unifiedTool = getTool(toolName);
    if (unifiedTool) {
      const input = JSON.parse(toolCall.function.arguments || "{}");
      return executeTool(toolName, input, context);
    }
    
    // Fallback to legacy tool runner
    try {
      const result = await toolRunnerService.runTool(toolCall, userMessage);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "LEGACY_TOOL_ERROR",
          message: `Legacy tool execution failed: ${error}`,
        },
      };
    }
  };
  
  /**
   * Register an agent as a tool
   */
  const registerAgentTool = (agentType: AgentType) => {
    const agentTool = createAgentTool(agentType);
    registerTool(agentTool);
  };
  
  /**
   * Initialize with default tools
   */
  const initialize = async () => {
    logger.info("Initializing unified tool runner service");
    
    // TODO: Register local tools as unified tools
    // TODO: Register MCP tools if available
    // TODO: Register callable agents as tools
  };
  
  // Return public API
  return {
    registerTool,
    registerTools,
    getTool,
    listTools,
    executeTool,
    runLegacyTool,
    registerAgentTool,
    getUsageStats,
    initialize,
    
    // Tool source helpers
    getLocalTools: () => listTools("local"),
    getMCPTools: () => listTools("mcp"),
    getAgentTools: () => listTools("agent"),
    getExternalTools: () => listTools("external"),
  };
};

// Export singleton instance
export const unifiedToolRunnerService = createUnifiedToolRunnerService();