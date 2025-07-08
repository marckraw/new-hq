import { logger } from "@/utils/logger";
import {
  MemoryType,
  MemoryTypeEnum,
} from "../../../../routes/api/memories/validation/memory";
import { qdrantService } from "../../../../services/atoms/QdrantService/qdrant.service";
import {
  UserMemory,
  MemoryContext,
} from "../../../../services/atoms/QdrantService/qdrant.service";

/**
 * Memory Service
 *
 * A high-level service for managing agent and user memories.
 * It abstracts the underlying vector database implementation (Qdrant).
 */
export const createMemoryService = () => {
  const qdrant = qdrantService;

  /**
   * Saves a memory to the vector store.
   * This involves generating an embedding and storing it.
   */
  const save = async (
    content: string,
    type: MemoryTypeEnum,
    metadata: Record<string, any> = {}
  ): Promise<void> => {
    try {
      const embedding = await qdrant.generateEmbedding(content);

      // In a real application, you would persist this memory to a primary DB (e.g., PostgreSQL)
      // and get a memory ID. For now, we'll use a placeholder.
      const memoryId = Math.floor(Math.random() * 100000);

      const memory: UserMemory = {
        id: memoryId,
        embedding,
        content,
        type,
        metadata,
        confidence: 1.0, // Agent-initiated memories are high confidence
        source: "agent_tool",
        createdAt: new Date(),
      };

      await qdrant.storeUserMemory(memory);
      logger.info(`🧠 Memory saved: [${type}] "${content}"`);
    } catch (error) {
      logger.error("Failed to save memory:", error);
      throw error;
    }
  };

  /**
   * Retrieves relevant memories based on a query.
   */
  const retrieve = async (
    query: string,
    options: {
      limit?: number;
      minScore?: number;
      contextTypes?: (typeof MemoryType)[];
      conversationId?: string;
      includeConversational?: boolean;
    } = {}
  ): Promise<MemoryContext> => {
    try {
      logger.info(`🧠 Retrieving memories for query: "${query}"`);
      return await qdrant.getRelevantMemories(query, options);
    } catch (error) {
      logger.error("Failed to retrieve memories:", error);
      throw error;
    }
  };

  return {
    save,
    retrieve,
  };
};

export const memoryService = createMemoryService();

export type MemoryService = typeof memoryService;
