import { z } from "@hono/zod-openapi";
import { logger } from "@/utils/logger";
import { ToolContext, ToolResult, CategorizedTool } from "../unified-tool.types";
import { serviceRegistry } from "../../../registry/service-registry";
import { MemoryType, MemoryTypeEnum } from "../../../routes/api/memories/validation/memory";

// Input schema for the unified save memory tool
const SaveMemoryInputSchema = z.object({
  reasoning: z.string().describe(
    "Explain briefly why this information is important enough to remember"
  ),
  content: z.string().min(3).describe("The exact text that should be saved to memory"),
  type: z.nativeEnum(MemoryType).describe(
    "The category of memory (e.g. personal_fact, preference, goal, etc.)"
  ),
  confidence: z.number().min(0.1).max(1.0).optional().describe(
    "Confidence level (0.1-1.0). Use 0.8+ for explicit statements, 0.5-0.7 for inferred info"
  ),
});

type SaveMemoryInput = z.infer<typeof SaveMemoryInputSchema>;

/**
 * Unified save memory tool with enhanced capabilities
 */
export const createSaveMemoryTool = (): CategorizedTool => {
  return {
    name: "save_memory",
    description: "Store important information that should be recalled in future conversations",
    version: "2.0.0",
    category: "memory",
    tags: ["persistence", "knowledge", "context"],
    
    source: "local",
    parameters: SaveMemoryInputSchema,
    
    execute: async (
      input: SaveMemoryInput,
      context: ToolContext
    ): Promise<ToolResult<string>> => {
      const startTime = Date.now();
      
      try {
        const { content, type, reasoning, confidence } = input;
        
        // Get memory service
        const memoryService = serviceRegistry.get("memory");
        
        // Enhanced metadata with context
        const metadata = {
          reasoning,
          confidence: confidence ?? 0.9,
          conversationId: context.conversationId,
          userId: context.userId,
          // Track if this was saved by an agent delegation
          savedBy: context.delegation?.fromAgent || "user",
          delegationPath: context.delegation?.delegationPath,
        };
        
        // Save the memory
        await memoryService.save(content, type as MemoryTypeEnum, metadata);
        
        logger.info("Memory saved successfully", {
          type,
          contentLength: content.length,
          confidence: metadata.confidence,
          savedBy: metadata.savedBy,
        });
        
        return {
          success: true,
          data: `✅ Memory saved: "${content.slice(0, 60)}..."`,
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
        
      } catch (error) {
        logger.error("Failed to save memory", { error, input });
        
        return {
          success: false,
          error: {
            code: "MEMORY_SAVE_ERROR",
            message: "Failed to save memory",
            details: error,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      }
    },
    
    validate: async (input: unknown) => {
      const result = SaveMemoryInputSchema.safeParse(input);
      if (result.success) {
        return { valid: true };
      }
      return {
        valid: false,
        errors: result.error.issues.map(issue => 
          `${issue.path.join(".")}: ${issue.message}`
        ),
      };
    },
    
    canExecute: async (_context: ToolContext) => {
      // Check if memory service is available
      try {
        const memoryService = serviceRegistry.get("memory");
        if (!memoryService) {
          return {
            allowed: false,
            reason: "Memory service not available",
          };
        }
        
        // Could add additional checks here:
        // - User permissions
        // - Rate limiting
        // - Memory quota
        
        return { allowed: true };
      } catch (error) {
        return {
          allowed: false,
          reason: "Memory service initialization failed",
        };
      }
    },
  };
};