import { createImageToolDefinition, createImage } from "./createImage.tool";
// import { getWeatherToolDefinition, getWeather } from "./getWeather.tool";
import { saveMemoryToolDefinition, saveMemory } from "./saveMemory.tool";
import { readUrlToolDefinition } from "./firecrawl/read_url.tool";
import {
  analyzeYoutubeToolDefinition,
  analyzeYoutubeVideo,
} from "./analyzeYoutube.tool";
import { composePlanToolDefinition } from "./planning/composePlan.tool";
import { readPlanToolDefinition } from "./planning/readPlan.tool";
import { updatePlanToolDefinition } from "./planning/updatePlan.tool";
import { evaluateResponseToolDefinition } from "./planning/evaluateResponse.tool";

export const layoutArchitectureTools = [];

export const allTools = {
  // [getWeatherToolDefinition.name]: {
  //   definition: getWeatherToolDefinition,
  //   function: getWeather,
  // },
  [createImageToolDefinition.name]: {
    definition: createImageToolDefinition,
    function: createImage,
  },
  [saveMemoryToolDefinition.name]: {
    definition: saveMemoryToolDefinition,
    function: saveMemory,
  },
  [analyzeYoutubeToolDefinition.name]: {
    definition: analyzeYoutubeToolDefinition,
    function: analyzeYoutubeVideo,
  },
};

export const toolArr = Object.values(allTools).map((tool) => tool.definition);

export const localTools = [
  createImageToolDefinition,
  readUrlToolDefinition,
  composePlanToolDefinition,
  readPlanToolDefinition,
  updatePlanToolDefinition,
  evaluateResponseToolDefinition,
  saveMemoryToolDefinition,
  analyzeYoutubeToolDefinition,
  ...layoutArchitectureTools,
];
