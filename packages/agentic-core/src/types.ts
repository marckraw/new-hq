import { z } from "zod";

// Core Agent Types
export const AgentStatusSchema = z.enum([
  "idle",
  "thinking",
  "executing",
  "completed",
  "error",
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.number(),
  metadata: z.record(z.any()).optional(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.any()),
  execute: z.function(),
});
export type AgentTool = z.infer<typeof AgentToolSchema>;

export const AgentContextSchema = z.object({
  sessionId: z.string(),
  userId: z.string().optional(),
  messages: z.array(AgentMessageSchema),
  tools: z.array(AgentToolSchema).optional(),
  metadata: z.record(z.any()).optional(),
});
export type AgentContext = z.infer<typeof AgentContextSchema>;

// Workflow Types
export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["agent", "tool", "condition", "loop"]),
  config: z.record(z.any()),
  dependencies: z.array(z.string()).optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  steps: z.array(WorkflowStepSchema),
  metadata: z.record(z.any()).optional(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

// Memory Types
export const MemoryEntrySchema = z.object({
  id: z.string(),
  type: z.enum(["short_term", "long_term", "episodic", "semantic"]),
  content: z.string(),
  embedding: z.array(z.number()).optional(),
  metadata: z.record(z.any()).optional(),
  timestamp: z.number(),
  relevanceScore: z.number().optional(),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
