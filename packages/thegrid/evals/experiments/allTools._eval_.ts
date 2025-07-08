import "dotenv/config";

import { llmService } from "../../src/domains/ai/services/LLMService/llm.service";
import { runEval } from "../framework/evalTools";
import { ToolCallMatch } from "../scorers";
import { weatherTool } from "../../src/agent/tools/getWeather.tool";
import { createImageToolDefinition } from "../../src/agent/tools/createImage.tool";

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

const allTools = [weatherTool, createImageToolDefinition];

runEval("allTools", {
  task: (input) =>
    llmService.runOpenRouterLLM({
      messages: [{ role: "user", content: input }],
      tools: allTools,
    }),
  data: [
    {
      input: "Tell me the weather in Tokyo",
      expected: createToolCallMessage(weatherTool.name),
    },
    {
      input: "Create an image of a cat",
      expected: createToolCallMessage(createImageToolDefinition.name),
    },
  ],
  scorers: [ToolCallMatch],
});
