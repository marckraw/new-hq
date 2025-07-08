import "dotenv/config";

import { llmService } from "../../src/domains/ai/services/LLMService/llm.service";
import { createImageToolDefinition } from "../../src/agent/tools/createImage.tool";
import { runEval } from "../framework/evalTools";
import { ToolCallMatch } from "../scorers";

const createToolCallMessage = (toolName: string) => ({
  role: "assistant",
  tool_calls: [
    {
      type: "function",
      function: {
        name: toolName,
      },
    },
  ],
});

runEval("createImage", {
  task: (input) =>
    llmService.runLLM({
      messages: [{ role: "user", content: input }],
      tools: [createImageToolDefinition],
    }),
  data: [
    {
      input: "Generate an image of a sunset",
      expected: createToolCallMessage(createImageToolDefinition.name),
    },
    {
      input: "create a photo of the sunset",
      expected: createToolCallMessage(createImageToolDefinition.name),
    },
  ],
  scorers: [ToolCallMatch],
});
