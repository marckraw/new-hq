import { z } from "@hono/zod-openapi";
import { UnifiedTool, ToolContext, ToolResult } from "../unified-tool.types";
import type { ToolFn } from "../../../additional-types";

// Interface for legacy tool definitions
interface LegacyToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema<any>;
}

/**
 * Adapts a legacy local tool to the unified tool interface
 */
export const createLocalToolAdapter = <TInput, TOutput>(
  definition: LegacyToolDefinition,
  toolFunction: ToolFn<TInput, TOutput>
): UnifiedTool<TInput, TOutput> => {
  return {
    name: definition.name,
    description: definition.description,
    source: "local",
    parameters: definition.parameters,
    
    execute: async (input: TInput, _context: ToolContext): Promise<ToolResult<TOutput>> => {
      const startTime = Date.now();
      
      try {
        // Legacy tools expect { userMessage, toolArgs } structure
        const legacyInput = {
          userMessage: "", // Legacy compatibility
          toolArgs: input,
        };
        
        const result = await toolFunction(legacyInput as any);
        
        return {
          success: true,
          data: result,
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: "TOOL_EXECUTION_ERROR",
            message: `Tool ${definition.name} failed`,
            details: error,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      }
    },
    
    validate: async (input: unknown) => {
      const result = definition.parameters.safeParse(input);
      if (result.success) {
        return { valid: true };
      }
      return {
        valid: false,
        errors: result.error.issues.map(issue => issue.message),
      };
    },
  };
};

/**
 * Convert all legacy tools to unified tools
 */
export const convertLegacyTools = (
  tools: Record<string, { definition: LegacyToolDefinition; function: ToolFn<any, any> }>
): UnifiedTool[] => {
  return Object.values(tools).map(({ definition, function: fn }) =>
    createLocalToolAdapter(definition, fn)
  );
};