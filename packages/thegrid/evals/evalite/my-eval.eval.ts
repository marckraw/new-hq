import { evalite } from "evalite";
import { Levenshtein } from "autoevals";
import { serviceRegistry } from "../../src/registry/service-registry";
import { createLLMService } from "../../src/domains/ai/services/LLMService/llm.service";

evalite("My Eval", {
  // A function that returns an array of test data
  data: async () => {
    return [
      { input: "What is the capitol of Germany?", expected: "Berlin." },
      { input: "What is the capitol of France?", expected: "Paris." },
      { input: "What is the capitol of Italy?", expected: "Rome." },
    ];
  },
  // The task to perform
  task: async (input) => {
    // Register the LLM service with browser support at module level
    serviceRegistry.register("llm", () =>
      createLLMService({ dangerouslyAllowBrowser: true })
    );
    const llmService = serviceRegistry.get("llm");

    const result = await llmService.runLLM({
      messages: [
        {
          role: "system",
          content: `
          You are a helpful assistant. Please be concise and to the point. Try to answer the question in a single word or sentence.
          `,
        },
        { role: "user", content: input },
      ],
      tools: [],
    });

    return result?.content as string;
  },
  // The scoring methods for the eval
  scorers: [Levenshtein],
});
