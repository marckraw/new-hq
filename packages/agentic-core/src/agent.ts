import { AgentContext, AgentMessage, AgentStatus, AgentTool } from "./types";

/**
 * Base Agent class providing core functionality for agentic workflows
 */
export class BaseAgent {
  private context: AgentContext;
  private status: AgentStatus = "idle";
  private tools: Map<string, AgentTool> = new Map();

  constructor(context: AgentContext) {
    this.context = context;
    this.registerTools(context.tools || []);
  }

  /**
   * Get current agent status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Update agent status
   */
  protected setStatus(status: AgentStatus): void {
    this.status = status;
  }

  /**
   * Get agent context
   */
  getContext(): AgentContext {
    return this.context;
  }

  /**
   * Add a message to the conversation
   */
  addMessage(message: Omit<AgentMessage, "timestamp">): void {
    const fullMessage: AgentMessage = {
      ...message,
      timestamp: Date.now(),
    };
    this.context.messages.push(fullMessage);
  }

  /**
   * Get all messages in the conversation
   */
  getMessages(): AgentMessage[] {
    return this.context.messages;
  }

  /**
   * Get the last N messages
   */
  getRecentMessages(count: number): AgentMessage[] {
    return this.context.messages.slice(-count);
  }

  /**
   * Register tools for the agent
   */
  private registerTools(tools: AgentTool[]): void {
    tools.forEach((tool) => {
      this.tools.set(tool.name, tool);
    });
  }

  /**
   * Get available tools
   */
  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found`);
    }

    this.setStatus("executing");
    try {
      const result = await tool.execute(parameters);
      this.setStatus("completed");
      return result;
    } catch (error) {
      this.setStatus("error");
      throw error;
    }
  }

  /**
   * Process a user message (stub implementation)
   */
  async processMessage(content: string): Promise<string> {
    this.setStatus("thinking");

    // Add user message
    this.addMessage({
      id: `msg_${Date.now()}`,
      role: "user",
      content,
    });

    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Generate response (stub)
    const response = `I received your message: "${content}". This is a stub response.`;

    // Add assistant response
    this.addMessage({
      id: `msg_${Date.now()}`,
      role: "assistant",
      content: response,
    });

    this.setStatus("completed");
    return response;
  }
}

/**
 * Create a new agent instance
 */
export function createAgent(context: AgentContext): BaseAgent {
  return new BaseAgent(context);
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a basic agent context
 */
export function createAgentContext(
  sessionId?: string,
  userId?: string
): AgentContext {
  return {
    sessionId: sessionId || generateSessionId(),
    userId,
    messages: [],
    tools: [],
    metadata: {},
  };
}
