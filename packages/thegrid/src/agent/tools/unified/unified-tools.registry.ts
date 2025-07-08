import { logger } from "@/utils/logger";
import { UnifiedTool, CategorizedTool } from "../unified-tool.types";
import { unifiedToolRunnerService } from "../../../services/atoms/ToolRunnerService/unified-tool-runner.service";
import { createLocalToolAdapter } from "../adapters/local-tool.adapter";

// Import unified tool implementations
import { createSaveMemoryTool } from "./saveMemory.unified";
import { createImageGenerationTool } from "./createImage.unified";

// Import legacy tools for adaptation
import { allTools } from "../index";
import { 
  readUrlToolDefinition, 
  readUrl 
} from "../firecrawl/read_url.tool";
import {
  analyzeYoutubeToolDefinition,
  analyzeYoutubeVideo,
} from "../analyzeYoutube.tool";
import {
  composePlanToolDefinition,
  composePlan,
} from "../planning/composePlan.tool";
import {
  readPlanToolDefinition,
  readPlan,
} from "../planning/readPlan.tool";
import {
  updatePlanToolDefinition,
  updatePlan,
} from "../planning/updatePlan.tool";
import {
  evaluateResponseToolDefinition,
  evaluateResponse,
} from "../planning/evaluateResponse.tool";

/**
 * Registry for all unified tools
 */
export const createUnifiedToolsRegistry = () => {
  const tools: Map<string, UnifiedTool> = new Map();
  
  /**
   * Register native unified tools
   */
  const registerNativeTools = () => {
    const nativeTools: CategorizedTool[] = [
      createSaveMemoryTool(),
      createImageGenerationTool(),
    ];
    
    nativeTools.forEach(tool => {
      tools.set(tool.name, tool);
      unifiedToolRunnerService.registerTool(tool);
    });
    
    logger.info(`Registered ${nativeTools.length} native unified tools`);
  };
  
  /**
   * Register adapted legacy tools
   */
  const registerLegacyTools = () => {
    // Tools that need individual adaptation
    const individualAdaptations = [
      { definition: readUrlToolDefinition, function: readUrl },
      { definition: analyzeYoutubeToolDefinition, function: analyzeYoutubeVideo },
      { definition: composePlanToolDefinition, function: composePlan },
      { definition: readPlanToolDefinition, function: readPlan },
      { definition: updatePlanToolDefinition, function: updatePlan },
      { definition: evaluateResponseToolDefinition, function: evaluateResponse },
    ];
    
    // Adapt individual tools
    individualAdaptations.forEach(({ definition, function: fn }) => {
      const adaptedTool = createLocalToolAdapter(definition, fn);
      tools.set(adaptedTool.name, adaptedTool);
      unifiedToolRunnerService.registerTool(adaptedTool);
    });
    
    // Adapt tools from allTools registry (excluding ones we've already adapted)
    const alreadyAdapted = new Set(individualAdaptations.map(t => t.definition.name));
    Object.entries(allTools).forEach(([name, { definition, function: fn }]) => {
      if (!alreadyAdapted.has(name)) {
        const adaptedTool = createLocalToolAdapter(definition, fn);
        tools.set(adaptedTool.name, adaptedTool);
        unifiedToolRunnerService.registerTool(adaptedTool);
      }
    });
    
    logger.info(`Adapted ${tools.size} legacy tools to unified interface`);
  };
  
  /**
   * Initialize all tools
   */
  const initialize = async () => {
    logger.info("Initializing unified tools registry");
    
    // Register native unified tools
    registerNativeTools();
    
    // Register adapted legacy tools
    registerLegacyTools();
    
    // Initialize the unified tool runner
    await unifiedToolRunnerService.initialize();
    
    logger.info(`Total tools registered: ${tools.size}`);
  };
  
  /**
   * Get tool by name
   */
  const getTool = (name: string): UnifiedTool | undefined => {
    return tools.get(name);
  };
  
  /**
   * List all tools
   */
  const listTools = (): UnifiedTool[] => {
    return Array.from(tools.values());
  };
  
  /**
   * List tools by category
   */
  const listToolsByCategory = (category: string): CategorizedTool[] => {
    return Array.from(tools.values()).filter(
      (tool): tool is CategorizedTool => 
        'category' in tool && tool.category === category
    );
  };
  
  /**
   * Get tool schemas for LLM
   */
  const getToolSchemas = () => {
    return Array.from(tools.values()).map(tool => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ? 
          // Convert Zod schema to JSON schema (simplified)
          {
            type: "object",
            properties: {},
            required: [],
          } : 
          undefined,
      },
    }));
  };
  
  return {
    initialize,
    getTool,
    listTools,
    listToolsByCategory,
    getToolSchemas,
    
    // Direct access to service for advanced usage
    runner: unifiedToolRunnerService,
  };
};

// Export singleton instance
export const unifiedToolsRegistry = createUnifiedToolsRegistry();