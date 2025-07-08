import { logger } from "@/utils/logger";
import type { ToolFn } from "../../additional-types";
import { z } from "@hono/zod-openapi";
import { serviceRegistry } from "../../registry/service-registry";

export const createImageToolDefinition = {
  name: "create_image",
  description: `use this to create/generate an image.`,
  parameters: z.object({
    reasoning: z
      .string()
      .describe("Why did you pick this tool to generate the image?"),
    prompt: z
      .string()
      .describe(
        "prompt for the image. Be sure to consider the user's original message when making the prompt. If you are unsure, then as the user to provide more details."
      ),
    whichModelToUse: z
      .enum(["openai", "leonardo"])
      .describe(
        "Which model to use to generate the image. If the user didn't mention which model to use, you must ask which one they want to use: openai, or leonardo. Make sure to look at the whole conversation history before making your choice."
      ),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags to associate with the generated image"),
  }),
};

type Args = z.infer<typeof createImageToolDefinition.parameters>;

export const createImage: ToolFn<Args, string> = async ({
  toolArgs,
  userMessage: _userMessage,
}) => {
  if (toolArgs.whichModelToUse === "openai") {
    const model = "gpt-image-1";
    // const response = await llmService.openai.images.generate({
    //   model: "dall-e-3",
    //   prompt: `${toolArgs.prompt}`,
    //   n: 1,
    //   size: "1024x1024",
    // });

    // const url = response?.data?.[0]?.url!;

    // New openai image model - but suuuuuuper expensive, so commented out for now
    // EDIT: with low quality, it's not bad, so lets leave it working for now
    const llmService = serviceRegistry.get("llm");
    const response = await llmService.openai.images.generate({
      model,
      prompt: toolArgs.prompt,
      moderation: "low",
      n: 1,
      quality: "medium",
    });

    const image_base64 = response.data?.[0]?.b64_json;
    if (!image_base64) {
      const error = "No image data returned from OpenAI";
      logger.error(error);
      throw new Error(error);
    }
    const buffer = Buffer.from(image_base64, "base64");
    const filename = `ai-image_${model}_${Date.now()}.png`;

    // Add tags for the image
    const tags = toolArgs.tags || ["ai-generated", "openai", "image"];

    // Upload to S3 and store in database
    const url = await serviceRegistry.get("aws").uploadImageToS3(
      buffer,
      filename,
      "ai-assistant", // uploadedBy
      tags
    );

    return url;
  } else if (toolArgs.whichModelToUse === "leonardo") {
    const response = await serviceRegistry.get("image").generateImage({
      prompt: toolArgs.prompt,
    });

    // Download the image from Leonardo's URL
    try {
      const imageUrl = response.imageUrl;
      logger.info("Leonardo image generated:", imageUrl);

      // Download the image
      const buffer = await serviceRegistry.get("fileTransfer").downloadImage(imageUrl);

      // Generate a filename
      const filename = `ai-image_leonardo_${Date.now()}.png`;

      // Add tags for the image
      const tags = toolArgs.tags || ["ai-generated", "leonardo", "image"];

      // Upload to S3 and store in database
      const s3Url = await serviceRegistry.get("aws").uploadImageToS3(
        buffer,
        filename,
        "ai-assistant", // uploadedBy
        tags
      );

      return s3Url;
    } catch (error) {
      logger.error("Error processing Leonardo image:", error);
      // Fallback to returning the original URL if there's an error
      return response.imageUrl;
    }
  } else {
    return "No model selected";
  }
};
