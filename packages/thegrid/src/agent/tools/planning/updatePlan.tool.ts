import type { ToolFn } from "../../../additional-types";
import { z } from "@hono/zod-openapi";
import { Content } from "@google/genai";
import fs from "fs";
import path from "path";

export const updatePlanToolDefinition = {
  name: "update_plan",
  description: `use this to update an existing plan file with new content.`,
  parameters: z.object({
    reasoning: z.string().describe("why did you pick this tool?"),
    date: z
      .string()
      .describe("The date of the plan file to update in YYYY-MM-DD format"),
    updatedContent: z.string().describe(
      `The new content to write to the plan file. Should follow the same markdown format as the original plan. So The plan should be a list of steps that will be used to complete the task. The plan should be written in markdown. and have the following format:
        # Plan
      [ ] Step 1
      [ ] Step 2
      [ ] Step 3
        and so on...

        This plan will be updated with update_plan tool function when the steps are completed.`
    ),
  }),
};

type Args = z.infer<typeof updatePlanToolDefinition.parameters>;

export const updatePlan: ToolFn<Args, Content | string> = async ({
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

  // Write the updated content to the file
  fs.writeFileSync(filepath, toolArgs.updatedContent);

  return `Plan for ${toolArgs.date} has been updated successfully`;
};
