# @efux/agentic-core

Essential primitives and utilities for building agentic workflows.

## Installation

```bash
npm install @efux/agentic-core
```

## Features

- **Agent Management**: Core agent primitives for building AI agents
- **Workflow Orchestration**: Tools for creating and executing multi-step workflows
- **Memory Systems**: Memory management for agent contexts and long-term storage
- **Type Safety**: Full TypeScript support with Zod schemas
- **Extensible**: Designed to be extended and customized

## Quick Start

### Basic Agent

```typescript
import { createAgent, createAgentContext } from "@efux/agentic-core";

// Create an agent context
const context = createAgentContext();

// Create an agent
const agent = createAgent(context);

// Process a message
const response = await agent.processMessage("Hello, world!");
console.log(response);
```

### Workflow Orchestration

```typescript
import {
  createWorkflowEngine,
  createWorkflow,
  createWorkflowStep,
} from "@efux/agentic-core";

// Create a workflow engine
const engine = createWorkflowEngine();

// Create workflow steps
const step1 = createWorkflowStep("step1", "Analyze Input", "agent", {});
const step2 = createWorkflowStep("step2", "Execute Tool", "tool", {});

// Create a workflow
const workflow = createWorkflow(
  "my-workflow",
  "My First Workflow",
  "A simple workflow example",
  [step1, step2]
);

// Register and execute
engine.registerWorkflow(workflow);
const result = await engine.executeWorkflow("my-workflow");
```

### Memory Management

```typescript
import { createMemoryManager } from "@efux/agentic-core";

// Create a memory manager
const memory = createMemoryManager();

// Add memories
await memory.addMemory("User prefers dark mode", "long_term");
await memory.addMemory("Last conversation was about AI", "episodic");

// Search memories
const memories = await memory.searchMemories("dark mode");
console.log(memories);
```

## API Reference

### Agent

- `BaseAgent`: Core agent class
- `createAgent()`: Create a new agent instance
- `createAgentContext()`: Create agent context

### Workflow

- `WorkflowEngine`: Workflow orchestration engine
- `createWorkflowEngine()`: Create workflow engine
- `createWorkflow()`: Create workflow definition

### Memory

- `MemoryManager`: Memory management system
- `createMemoryManager()`: Create memory manager
- `InMemoryStore`: In-memory storage implementation

## Types

All types are exported and available for use:

```typescript
import {
  AgentContext,
  AgentMessage,
  Workflow,
  MemoryEntry,
} from "@efux/agentic-core";
```

## Development

This package is designed to be the foundation for agentic systems. It provides:

- **Stub implementations** for rapid prototyping
- **Extensible interfaces** for custom implementations
- **Type safety** with Zod schemas
- **Minimal dependencies** for easy integration

## License

MIT
