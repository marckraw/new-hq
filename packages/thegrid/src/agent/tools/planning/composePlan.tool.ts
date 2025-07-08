import type { ToolFn } from "../../../additional-types";
import { z } from "@hono/zod-openapi";
import { Content } from "@google/genai";
import fs from "fs";
import path from "path";

export const composePlanToolDefinition = {
  name: "compose_plan",
  description: `use this to compose a plan to complete the task the user has asked for.`,
  parameters: z.object({
    reasoning: z.string().describe("why did you pick this tool?"),
    plan: z.string().describe(
      `Based on the user's message, compose a plan to complete the task the user has asked for. The plan should be a list of steps that will be used to complete the task. The plan should be written in markdown. and have the following format:
        # Plan
      [ ] Step 1
      [ ] Step 2
      [ ] Step 3
        and so on...

        This plan will be updated with update_plan tool function when the steps are completed.
      `
    ),
  }),
};

type Args = z.infer<typeof composePlanToolDefinition.parameters>;

export const composePlan: ToolFn<Args, Content | string> = async ({
  toolArgs,
  userMessage: _userMessage,
}) => {
  const planContent = toolArgs.plan;
  const planDir = path.join(process.cwd(), "plans");

  // Create plans directory if it doesn't exist
  if (!fs.existsSync(planDir)) {
    fs.mkdirSync(planDir, { recursive: true });
  }

  // Create a unique filename using timestamp
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `plan-${timestamp}.md`;
  const filepath = path.join(planDir, filename);

  // Write the plan to the file
  fs.writeFileSync(filepath, planContent);

  return `Plan has been created and saved to: ${filepath}`;
};
