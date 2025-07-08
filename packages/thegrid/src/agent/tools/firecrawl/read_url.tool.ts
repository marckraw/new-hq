import type { ToolFn } from "../../../additional-types";
import { z } from "@hono/zod-openapi";
import { firecrawlService } from "../../../services/atoms/FirecrawlService/firecrawl.service";

export const readUrlToolDefinition = {
  name: "read_url",
  description: `use this to read a url. Whenever a user will pass a url, you should use this tool to read the content of the website from this url.`,
  parameters: z.object({
    reasoning: z.string().describe("why did you pick this tool?"),
    url: z
      .string()
      .describe(
        "The url to read. The LLM will return a response that will be used to answer the user's message."
      ),
  }),
};

type Args = z.infer<typeof readUrlToolDefinition.parameters>;

export const readUrl: ToolFn<Args, string> = async ({
  toolArgs,
  userMessage: _userMessage,
}) => {
  const response = await firecrawlService.scrapeWebsite({
    url: toolArgs.url,
  });

  if (!response) {
    return "Something went wrong i guess";
  }

  return response;
};
