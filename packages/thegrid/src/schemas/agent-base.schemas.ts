import { z } from "@hono/zod-openapi";

// Agent types enum schema - moved here to avoid circular dependency
export const AgentTypeSchema = z.enum([
  "general",
  "scribe",
  "rephraser",
  "figma-analyzer",
  "test-openrouter",
  "figma-to-storyblok",
  "irf-architect",
  "storyblok-editor",
  "decision-maker",
  "orchestrator",
  "site-builder",
]);

// Agent capabilities enum schema
export const AgentCapabilitySchema = z.enum([
  "web_search",
  "image_generation",
  "file_analysis",
  "planning",
  "memory_search",
  "writing",
  "summarizing",
  "content_creation",
  "text_refinement",
  "text_rephrasing",
  "clarity_improvement",
  "design_analysis",
  "figma_integration",
  "ui_ux_feedback",
  "storyblok_components",
  "cms_management",
  "content_structure",
  "layout_design",
  "architecture_planning",
  "design_systems",
  "storyblok_editing",
  "irf_transformation",
  "content_validation",
  "openrouter_models",
  "experimental_features",
  "model_testing",
  "design_to_code",
  "component_generation",
  "message_analysis",
  "action_planning",
  "memory_management",
  "workflow_routing",
  "task_analysis",
  "agent_coordination",
  "parallel_execution",
  "pipeline_execution",
  "result_synthesis",
]);

// Inferred types
export type AgentType = z.infer<typeof AgentTypeSchema>;
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;