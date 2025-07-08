import type OpenAI from "openai";
import {
  createImageToolDefinition,
  createImage,
} from "../../../agent/tools/createImage.tool";
import {
  readUrl,
  readUrlToolDefinition,
} from "../../../agent/tools/firecrawl/read_url.tool";
import {
  composePlan,
  composePlanToolDefinition,
} from "../../../agent/tools/planning/composePlan.tool";
import {
  readPlan,
  readPlanToolDefinition,
} from "../../../agent/tools/planning/readPlan.tool";
import {
  updatePlan,
  updatePlanToolDefinition,
} from "../../../agent/tools/planning/updatePlan.tool";
import {
  evaluateResponse,
  evaluateResponseToolDefinition,
} from "../../../agent/tools/planning/evaluateResponse.tool";
import {
  saveMemory,
  saveMemoryToolDefinition,
} from "../../../agent/tools/saveMemory.tool";
import { localTools } from "../../../agent/tools";
import {
  analyzeYoutubeToolDefinition,
  analyzeYoutubeVideo,
} from "../../../agent/tools/analyzeYoutube.tool";
import { ToolContext } from "../../../agent/tools/unified-tool.types";

// Tool registry - maps tool names to their execution functions
const TOOL_REGISTRY = {
  [createImageToolDefinition.name]: createImage,
  [readUrlToolDefinition.name]: readUrl,
  [composePlanToolDefinition.name]: composePlan,
  [readPlanToolDefinition.name]: readPlan,
  [updatePlanToolDefinition.name]: updatePlan,
  [evaluateResponseToolDefinition.name]: evaluateResponse,
  [saveMemoryToolDefinition.name]: saveMemory,
  [analyzeYoutubeToolDefinition.name]: analyzeYoutubeVideo,
} as const;

const createToolRunnerService = () => {
  // Lazy load unified tool runner to avoid circular dependency
  let _unifiedToolRunner: any = null;
  const getUnifiedToolRunner = () => {
    if (!_unifiedToolRunner) {
      // Lazy import to avoid circular dependency
      const { unifiedToolRunnerService } = require("./unified-tool-runner.service");
      _unifiedToolRunner = unifiedToolRunnerService;
    }
    return _unifiedToolRunner;
  };
  
  const runTool = async (
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    userMessage: string,
    context?: Partial<ToolContext>
  ) => {
    // Try unified tool runner first
    const unifiedRunner = getUnifiedToolRunner();
    const unifiedTool = unifiedRunner.getTool(toolCall.function.name);
    if (unifiedTool) {
      const toolContext: ToolContext = {
        conversationId: context?.conversationId || 0,
        userId: context?.userId,
        executionId: context?.executionId,
        delegation: context?.delegation,
        constraints: context?.constraints,
        trace: context?.trace,
      };
      
      const result = await unifiedRunner.executeTool(
        toolCall.function.name,
        JSON.parse(toolCall.function.arguments || "{}"),
        toolContext
      );
      
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error?.message || "Tool execution failed");
      }
    }
    
    // Fallback to legacy tool execution
    const input = {
      userMessage,
      toolArgs: JSON.parse(toolCall.function.arguments || "{}"),
    };

    const toolFunction = TOOL_REGISTRY[toolCall.function.name];

    if (toolFunction) {
      return toolFunction(input);
    }

    return `Never run this tool: ${toolCall.function.name} again, or else!`;
  };

  const isLocalTool = (name: string) => {
    // Check unified tools first
    const unifiedRunner = getUnifiedToolRunner();
    const unifiedTool = unifiedRunner.getTool(name);
    if (unifiedTool && unifiedTool.source === "local") {
      return true;
    }
    // Fallback to legacy check
    return localTools.some((tool) => tool.name === name);
  };
  
  /**
   * Get all available tool definitions for LLM
   */
  const getToolDefinitions = () => {
    // Get unified tool schemas
    const unifiedRunner = getUnifiedToolRunner();
    const unifiedSchemas = unifiedRunner.listTools().map((tool: any) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ? 
          { type: "object", properties: {}, required: [] } : // Simplified
          undefined,
      },
    }));
    
    // Combine with legacy tools (avoiding duplicates)
    const unifiedNames = new Set(unifiedSchemas.map((s: any) => s.function.name));
    const legacySchemas = localTools
      .filter(tool => !unifiedNames.has(tool.name))
      .map(tool => ({
        type: "function" as const,
        function: tool,
      }));
    
    return [...unifiedSchemas, ...legacySchemas];
  };

  // Return public interface
  return {
    runTool,
    isLocalTool,
    getToolDefinitions,
    // Expose unified runner for advanced usage (lazy loaded)
    get unified() { return getUnifiedToolRunner(); },
  };
};

export { createToolRunnerService };
export const toolRunnerService = createToolRunnerService();
