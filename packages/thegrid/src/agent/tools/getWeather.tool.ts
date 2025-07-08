import { z } from "@hono/zod-openapi";

export const weatherTool = {
  name: "get_weather",
  description: `use this to get the weather.`,
  parameters: z.object({
    reasoning: z.string().describe("why did you pick this tool?"),
  }),
};
