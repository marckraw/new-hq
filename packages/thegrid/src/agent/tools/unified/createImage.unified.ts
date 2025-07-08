import { z } from "@hono/zod-openapi";
import { logger } from "@/utils/logger";
import { ToolContext, ToolResult, CategorizedTool } from "../unified-tool.types";
import { serviceRegistry } from "../../../registry/service-registry";

// Input schema for the unified create image tool
const CreateImageInputSchema = z.object({
  prompt: z.string().describe("Detailed description of the image to generate"),
  model: z.enum([
    "dall-e-3",
    "dall-e-2",
    "stable-diffusion",
    "leonardo-ai",
  ]).optional().default("leonardo-ai").describe("The AI model to use for generation"),
  size: z.enum([
    "256x256",
    "512x512",
    "1024x1024",
    "1792x1024",
    "1024x1792",
  ]).optional().default("1024x1024").describe("Size of the generated image"),
  quality: z.enum(["standard", "hd"]).optional().default("standard"),
  style: z.enum(["vivid", "natural"]).optional().describe("Style of the generated image"),
  n: z.number().min(1).max(4).optional().default(1).describe("Number of images to generate"),
});

type CreateImageInput = z.infer<typeof CreateImageInputSchema>;

interface ImageGenerationResult {
  url: string;
  revised_prompt?: string;
  model: string;
  size: string;
}

/**
 * Unified create image tool with multi-provider support
 */
export const createImageGenerationTool = (): CategorizedTool => {
  return {
    name: "create_image",
    description: "Generate images using AI models from various providers",
    version: "2.0.0",
    category: "content",
    tags: ["generation", "visual", "creative", "ai"],
    
    source: "local",
    sourceMetadata: {
      costTier: "high",
      estimatedDuration: 15000, // 15 seconds average
    },
    
    parameters: CreateImageInputSchema,
    
    execute: async (
      input: CreateImageInput,
      context: ToolContext
    ): Promise<ToolResult<ImageGenerationResult[]>> => {
      const startTime = Date.now();
      
      try {
        const { prompt, model, size, n } = input;
        
        logger.info("Generating image", {
          model,
          size,
          promptLength: prompt.length,
          requestedBy: context.delegation?.fromAgent || "user",
        });
        
        const results: ImageGenerationResult[] = [];
        
        // Route to appropriate service based on model
        if (model === "leonardo-ai") {
          const leonardoService = serviceRegistry.get("image");
          const result = await leonardoService.generateImage({
            prompt,
            num_images: n,
            width: parseInt(size.split("x")[0] || "1024"),
            height: parseInt(size.split("x")[1] || "1024"),
          });
          
          results.push({
            url: result.imageUrl,
            model: "leonardo-ai",
            size,
          });
        } else if (model.startsWith("dall-e")) {
          const imageService = serviceRegistry.get("image");
          const response = await imageService.generateImageWithDallE3({
            prompt,
          });
          
          results.push({
            url: response.imageUrl!,
            revised_prompt: response.revisedPrompt,
            model,
            size,
          });
        } else {
          // Future: Add stable diffusion, midjourney, etc.
          throw new Error(`Model ${model} not yet implemented`);
        }
        
        // Track usage if in delegation context
        if (context.delegation) {
          logger.info("Image generated via delegation", {
            fromAgent: context.delegation.fromAgent,
            depth: context.delegation.delegationDepth,
            imagesGenerated: results.length,
          });
        }
        
        return {
          success: true,
          data: results,
          metadata: {
            executionTime: Date.now() - startTime,
            tokensUsed: prompt.length * 4, // Rough estimate
            cost: n * 0.02, // Example cost calculation
          },
        };
        
      } catch (error) {
        logger.error("Failed to generate image", { error, input });
        
        return {
          success: false,
          error: {
            code: "IMAGE_GENERATION_ERROR",
            message: "Failed to generate image",
            details: error,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      }
    },
    
    validate: async (input: unknown) => {
      const result = CreateImageInputSchema.safeParse(input);
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
    
    estimateCost: async (input: CreateImageInput) => {
      const costs = {
        "dall-e-3": { standard: 0.04, hd: 0.08 },
        "dall-e-2": { standard: 0.02, hd: 0.02 },
        "leonardo-ai": { standard: 0.01, hd: 0.02 },
        "stable-diffusion": { standard: 0.005, hd: 0.01 },
      };
      
      const modelCost = costs[input.model || "leonardo-ai"];
      const qualityCost = modelCost[input.quality || "standard"];
      const totalCost = qualityCost * (input.n || 1);
      
      return {
        tokens: input.prompt.length * 4, // Rough token estimate
        cost: totalCost,
      };
    },
    
    canExecute: async (context: ToolContext) => {
      // Check constraints
      if (context.constraints?.maxCost) {
        const estimate = await createImageGenerationTool().estimateCost!(
          CreateImageInputSchema.parse({})
        );
        if (estimate.cost > context.constraints.maxCost) {
          return {
            allowed: false,
            reason: `Estimated cost ($${estimate.cost}) exceeds limit ($${context.constraints.maxCost})`,
          };
        }
      }
      
      // Check if required services are available
      try {
        const imageService = serviceRegistry.get("image");
        const llmService = serviceRegistry.get("llm");
        
        if (!imageService && !llmService) {
          return {
            allowed: false,
            reason: "No image generation services available",
          };
        }
        
        return { allowed: true };
      } catch (error) {
        return {
          allowed: false,
          reason: "Image generation services not initialized",
        };
      }
    },
  };
};