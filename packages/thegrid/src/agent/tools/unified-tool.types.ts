import { z } from "@hono/zod-openapi";
import { AgentType, AgentCapability } from "../factories/agents.factory.types";

// Tool source types
export type ToolSource = "local" | "mcp" | "agent" | "external";

// Tool execution context
export interface ToolContext {
  // Basic context
  conversationId: number;
  userId?: string;
  executionId?: string;

  // Agent delegation context
  delegation?: {
    fromAgent: AgentType;
    delegationDepth: number; // Prevent infinite delegation
    sharedContext?: any; // Context passed between agents (optional)
    parentExecutionId: string;
    delegationPath: AgentType[]; // Track the path of delegation
  };

  // Resource constraints
  constraints?: {
    maxExecutionTime?: number; // milliseconds
    maxTokens?: number;
    maxCost?: number;
  };

  // Debugging and tracing
  trace?: {
    enabled: boolean;
    verbosity: "minimal" | "normal" | "verbose";
  };
}

// Tool parameter schema
export const ToolParameterSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "object", "array"]),
  description: z.string(),
  required: z.boolean().default(true),
  default: z.any().optional(),
  enum: z.array(z.any()).optional(),
});

// Tool result types
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    executionTime: number; // milliseconds
    tokensUsed?: number;
    cost?: number;
  };
}

// Unified tool interface
export interface UnifiedTool<TInput = any, TOutput = any> {
  // Identification
  name: string;
  description: string;
  version?: string;

  // Source information
  source: ToolSource;
  sourceMetadata?: {
    // For MCP tools
    serverName?: string;
    serverVersion?: string;

    // For agent tools
    agentType?: AgentType;
    agentCapabilities?: AgentCapability[];
    estimatedDuration?: number; // milliseconds
    costTier?: "low" | "medium" | "high";

    // For external tools
    apiEndpoint?: string;
    authentication?: "none" | "apiKey" | "oauth";
  };

  // Parameters
  parameters?: z.ZodSchema<TInput>;

  // Execution
  execute: (
    input: TInput,
    context: ToolContext
  ) => Promise<ToolResult<TOutput>>;

  // Optional methods
  validate?: (input: unknown) => Promise<{ valid: boolean; errors?: string[] }>;
  estimateCost?: (input: TInput) => Promise<{ tokens: number; cost: number }>;
  canExecute?: (
    context: ToolContext
  ) => Promise<{ allowed: boolean; reason?: string }>;
}

// Tool registry entry
export interface ToolRegistryEntry {
  tool: UnifiedTool;
  metadata: {
    addedAt: Date;
    lastUsed?: Date;
    usageCount: number;
    averageExecutionTime?: number;
    successRate?: number;
  };
}

// Tool execution options
export interface ToolExecutionOptions {
  timeout?: number; // milliseconds
  retries?: number;
  retryDelay?: number; // milliseconds
  throwOnError?: boolean;
  trace?: boolean;
}

// Tool schema for OpenAI/Anthropic format
export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// Helper to convert UnifiedTool to OpenAI/Anthropic format
export const unifiedToolToSchema = (tool: UnifiedTool): ToolSchema => {
  // TODO: check this
  // eslint-disable-next-line prefer-const
  const parameters = {
    type: "object" as const,
    properties: {} as Record<string, any>,
    required: [] as string[],
  };

  // If tool has Zod schema, try to extract properties
  if (tool.parameters) {
    try {
      // This is a simplified version - in reality, you'd need a proper Zod to JSON Schema converter
      const shape = (tool.parameters as any)._def?.shape?.();
      if (shape) {
        for (const [key, _value] of Object.entries(shape)) {
          parameters.properties[key] = {
            type: "string", // Simplified - would need proper type detection
            description: `Parameter: ${key}`,
          };
          parameters.required.push(key);
        }
      }
    } catch (e) {
      // Fallback to generic object parameter
      parameters.properties = { input: { type: "object" } };
    }
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters,
    },
  };
};

// Type guards
export const isLocalTool = (tool: UnifiedTool): boolean =>
  tool.source === "local";
export const isMCPTool = (tool: UnifiedTool): boolean => tool.source === "mcp";
export const isAgentTool = (tool: UnifiedTool): boolean =>
  tool.source === "agent";
export const isExternalTool = (tool: UnifiedTool): boolean =>
  tool.source === "external";

// Tool categories for organization
export type ToolCategory =
  | "planning"
  | "memory"
  | "content"
  | "analysis"
  | "integration"
  | "utility"
  | "orchestration";

// Extended tool interface with category
export interface CategorizedTool extends UnifiedTool {
  category: ToolCategory;
  tags?: string[];
}
