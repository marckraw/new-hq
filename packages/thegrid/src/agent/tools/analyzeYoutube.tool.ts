import { logger } from "@/utils/logger";
import type { ToolFn } from "../../additional-types";
import { z } from "@hono/zod-openapi";
import { serviceRegistry } from "../../registry/service-registry";

export const analyzeYoutubeToolDefinition = {
  name: "analyze_youtube_video",
  description:
    "Download and transcribe a YouTube video to understand its contents.",
  parameters: z.object({
    reasoning: z.string().describe("Why did you choose this tool?"),
    url: z
      .string()
      .describe("The YouTube URL for the video you want to analyze."),
  }),
};

type Args = z.infer<typeof analyzeYoutubeToolDefinition.parameters>;

export const analyzeYoutubeVideo: ToolFn<Args, string> = async ({
  toolArgs,
}) => {
  try {
    return await serviceRegistry
      .get("youtube")
      .transcribeVideoFromUrl(toolArgs.url);
  } catch (error) {
    logger.error("Error analyzing YouTube video:", error);
    throw new Error("Failed to analyze YouTube video.");
  }
};
