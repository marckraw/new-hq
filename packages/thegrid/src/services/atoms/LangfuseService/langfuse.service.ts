import { logger } from "@/utils/logger";
import { Langfuse } from "langfuse";
import { config } from "../../../config.env";

export interface LangfuseTraceOptions {
  name?: string;
  sessionId?: string;
  userId?: string;
  conversationId?: number;
  agentType?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface LangfuseGenerationOptions {
  name: string;
  model: string;
  input: any;
  metadata?: Record<string, any>;
}

export interface LangfuseGenerationUpdate {
  output?: any;
  usage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  cost?: {
    input?: number;
    output?: number;
    total?: number;
  };
  error?: Error | string;
}

const createLangfuseService = () => {
  // Initialize Langfuse client with proper configuration
  const langfuse = (() => {
    if (!config.LANGFUSE_ENABLED) {
      logger.info("🔍 Langfuse tracing is disabled");
      return null;
    }

    if (!config.LANGFUSE_SECRET_KEY || !config.LANGFUSE_PUBLIC_KEY) {
      logger.warn(
        "⚠️ Langfuse API keys not configured. Tracing will be disabled."
      );
      return null;
    }

    try {
      const client = new Langfuse({
        secretKey: config.LANGFUSE_SECRET_KEY!,
        publicKey: config.LANGFUSE_PUBLIC_KEY!,
        baseUrl: config.LANGFUSE_BASE_URL,
        flushAt: config.LANGFUSE_FLUSH_AT,
        flushInterval: config.LANGFUSE_FLUSH_INTERVAL,
      });

      logger.info("🔍 Langfuse tracing initialized successfully", {
        baseUrl: config.LANGFUSE_BASE_URL,
        flushAt: config.LANGFUSE_FLUSH_AT,
        flushInterval: config.LANGFUSE_FLUSH_INTERVAL,
      });

      return client;
    } catch (error) {
      logger.error("❌ Failed to initialize Langfuse:", error);
      return null;
    }
  })();

  /**
   * Check if Langfuse is available and enabled
   */
  const isEnabled = (): boolean => {
    return langfuse !== null && config.LANGFUSE_ENABLED;
  };

  /**
   * Create a new trace for tracking LLM operations
   */
  const createTrace = (options: LangfuseTraceOptions) => {
    if (!isEnabled()) {
      return createNoOpTrace();
    }

    try {
      const trace = langfuse!.trace({
        name: options.name || "llm-operation",
        sessionId: options.sessionId,
        userId: options.userId,
        metadata: {
          ...options.metadata,
          conversationId: options.conversationId,
          agentType: options.agentType,
        },
        tags: options.tags,
      });

      return {
        trace,
        createGeneration: (genOptions: LangfuseGenerationOptions) => {
          const generation = trace.generation({
            name: genOptions.name,
            model: genOptions.model,
            input: genOptions.input,
            metadata: genOptions.metadata,
          });

          return {
            generation,
            end: (update: LangfuseGenerationUpdate) => {
              try {
                const endParams: any = {
                  output: update.output,
                  usage: update.usage,
                };

                if (update.error) {
                  endParams.level = "ERROR";
                  endParams.statusMessage =
                    typeof update.error === "string"
                      ? update.error
                      : update.error.message;
                }

                generation.end(endParams);
              } catch (error) {
                logger.error("Failed to end Langfuse generation:", error);
              }
            },
            update: (update: Partial<LangfuseGenerationUpdate>) => {
              try {
                generation.update({
                  output: update.output,
                  usage: update.usage,
                });
              } catch (error) {
                logger.error("Failed to update Langfuse generation:", error);
              }
            },
          };
        },
        createSpan: (name: string, metadata?: Record<string, any>) => {
          const span = trace.span({
            name,
            metadata,
          });

          return {
            span,
            end: (output?: any, error?: Error | string) => {
              try {
                const endParams: any = {
                  output,
                };

                if (error) {
                  endParams.level = "ERROR";
                  endParams.statusMessage =
                    typeof error === "string" ? error : error.message;
                }

                span.end(endParams);
              } catch (err) {
                logger.error("Failed to end Langfuse span:", err);
              }
            },
          };
        },
        end: (output?: any) => {
          try {
            trace.update({
              output,
            });
          } catch (error) {
            logger.error("Failed to end Langfuse trace:", error);
          }
        },
      };
    } catch (error) {
      logger.error("Failed to create Langfuse trace:", error);
      return createNoOpTrace();
    }
  };

  /**
   * Create a no-op trace that doesn't do anything
   * Used when Langfuse is disabled or fails to initialize
   */
  const createNoOpTrace = () => ({
    trace: null,
    createGeneration: () => ({
      generation: null,
      end: () => {},
      update: () => {},
    }),
    createSpan: () => ({
      span: null,
      end: () => {},
    }),
    end: () => {},
  });

  /**
   * Calculate token usage cost based on model and usage
   */
  const calculateCost = (
    model: string,
    usage: { input?: number; output?: number; total?: number }
  ): { input: number; output: number; total: number } => {
    // Simplified cost calculation - you can expand this with actual pricing
    const costs: Record<string, { input: number; output: number }> = {
      "gpt-4o": { input: 0.0025, output: 0.01 }, // per 1K tokens
      "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
      "gpt-4-turbo": { input: 0.01, output: 0.03 },
      "claude-3-sonnet": { input: 0.003, output: 0.015 },
      "claude-3-haiku": { input: 0.00025, output: 0.00125 },
      "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
    };

    const modelCosts = costs[model] || { input: 0.001, output: 0.003 }; // fallback

    const inputCost = (usage.input || 0) * (modelCosts.input / 1000);
    const outputCost = (usage.output || 0) * (modelCosts.output / 1000);

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  };

  /**
   * Flush all pending events to Langfuse
   */
  const flush = async (): Promise<void> => {
    if (!isEnabled()) return;

    try {
      await langfuse!.flushAsync();
    } catch (error) {
      logger.error("Failed to flush Langfuse events:", error);
    }
  };

  /**
   * Shutdown Langfuse client
   */
  const shutdown = async (): Promise<void> => {
    if (!isEnabled()) return;

    try {
      await langfuse!.shutdownAsync();
    } catch (error) {
      logger.error("Failed to shutdown Langfuse:", error);
    }
  };

  /**
   * Create a score/feedback for a trace or generation
   */
  const createScore = async (options: {
    traceId?: string;
    generationId?: string;
    name: string;
    value: number;
    comment?: string;
    metadata?: Record<string, any>;
  }) => {
    if (!isEnabled()) return;

    try {
      await langfuse!.score({
        traceId: options.traceId || "",
        observationId: options.generationId,
        name: options.name,
        value: options.value,
        comment: options.comment,
      });
    } catch (error) {
      logger.error("Failed to create Langfuse score:", error);
    }
  };

  return {
    isEnabled,
    createTrace,
    calculateCost,
    flush,
    shutdown,
    createScore,
    client: langfuse,
  };
};

export const langfuseService = createLangfuseService();
export type LangfuseService = typeof langfuseService;
