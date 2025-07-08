import { logger } from "@/utils/logger";
import { z } from "@hono/zod-openapi";
import type { ToolFn } from "../../additional-types";
import { serviceRegistry } from "../../registry/service-registry";
import {
  MemoryType,
  MemoryTypeEnum,
} from "../../routes/api/memories/validation/memory";

// -------------------------------------------------------------------------------------------------
// Tool definition
// -------------------------------------------------------------------------------------------------
export const saveMemoryToolDefinition = {
  name: "save_memory",
  description:
    "Use this tool to store an important piece of information that should be recalled in future conversations.",
  parameters: z.object({
    reasoning: z
      .string()
      .describe(
        "Explain briefly why this information is important enough to remember. This will be stored as metadata."
      ),
    content: z
      .string()
      .min(3)
      .describe("The exact text that should be saved to memory."),
    type: z
      .nativeEnum(MemoryType)
      .describe(
        "The category of memory (e.g. personal_fact, preference, goal, etc.)."
      ),
    confidence: z
      .number()
      .min(0.1)
      .max(1.0)
      .optional()
      .describe(
        "Confidence level (0.1-1.0). Use 0.8+ for explicit statements, 0.5-0.7 for inferred info."
      ),
  }),
};

// -------------------------------------------------------------------------------------------------
// Tool function
// -------------------------------------------------------------------------------------------------

type Args = z.infer<typeof saveMemoryToolDefinition.parameters>;

export const saveMemory: ToolFn<Args, string> = async ({ toolArgs }) => {
  try {
    const { content, type, reasoning, confidence } = toolArgs;

    // Persist the memory via the memory service
    const memoryService = serviceRegistry.get("memory");
    await memoryService.save(content, type as MemoryTypeEnum, {
      reasoning,
      confidence: confidence ?? 0.9,
    });

    return `✅ Memory saved: "${content.slice(0, 60)}..."`;
  } catch (error) {
    logger.error("[saveMemoryTool] Failed to save memory:", error);
    return "❌ Failed to save memory.";
  }
};
