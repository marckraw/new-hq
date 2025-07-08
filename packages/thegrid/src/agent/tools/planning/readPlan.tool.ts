import type { ToolFn } from "../../../additional-types";
import { z } from "@hono/zod-openapi";
import { Content } from "@google/genai";
import fs from "fs";
import path from "path";

export const readPlanToolDefinition = {
  name: "read_plan",
  description: `use this to read the content of a plan file.`,
  parameters: z.object({
    reasoning: z.string().describe("why did you pick this tool?"),
    date: z
      .string()
      .describe("The date of the plan file to read in YYYY-MM-DD format"),
  }),
};

type Args = z.infer<typeof readPlanToolDefinition.parameters>;

export const readPlan: ToolFn<Args, Content | string> = async ({
  toolArgs,
  userMessage: _userMessage,
}) => {
  const planDir = path.join(process.cwd(), "plans");
  const filename = `plan-${toolArgs.date}.md`;
  const filepath = path.join(planDir, filename);

  // Check if file exists
  if (!fs.existsSync(filepath)) {
    return `No plan file found for date: ${toolArgs.date}`;
  }

  // Read and return the plan content
  const planContent = fs.readFileSync(filepath, "utf-8");
  return planContent;
};
