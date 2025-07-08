import { QdrantClient } from "@qdrant/js-client-rest";
import { OpenAI } from "openai";
import { config } from "../../../config.env";
import {
  MemoryType,
  MemoryTypeEnum,
} from "../../../routes/api/memories/validation/memory";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../../../utils/logger";

// Initialize clients
const qdrantClient = new QdrantClient({
  url: config.QDRANT__SERVICE__URL,
  port: Number(config.QDRANT__SERVICE__PORT),
  apiKey: config.QDRANT__SERVICE__API_KEY as string,
});

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

// Collection configuration for conversational AI
const COLLECTIONS = {
  // Main collection for all user memories
  USER_MEMORIES: "user_memories",

  // Specialized collections for different contexts
  PERSONAL_CONTEXT: "personal_context", // personal_fact, preference, habit, goal
  PROFESSIONAL_CONTEXT: "professional_context", // work_context, project, skill
  CONVERSATIONAL_CONTEXT: "conversational_context", // important_context, conversation_insight, user_instruction
  SOCIAL_CONTEXT: "social_context", // relationship, location
  LEARNING_CONTEXT: "learning_context", // interest, learning, general
} as const;

// Memory type to collection mapping
const TYPE_TO_COLLECTION: Record<MemoryTypeEnum, string> = {
  [MemoryType.PERSONAL_FACT]: COLLECTIONS.PERSONAL_CONTEXT,
  [MemoryType.PREFERENCE]: COLLECTIONS.PERSONAL_CONTEXT,
  [MemoryType.GOAL]: COLLECTIONS.PERSONAL_CONTEXT,
  [MemoryType.HABIT]: COLLECTIONS.PERSONAL_CONTEXT,

  [MemoryType.WORK_CONTEXT]: COLLECTIONS.PROFESSIONAL_CONTEXT,
  [MemoryType.PROJECT]: COLLECTIONS.PROFESSIONAL_CONTEXT,
  [MemoryType.SKILL]: COLLECTIONS.PROFESSIONAL_CONTEXT,

  [MemoryType.IMPORTANT_CONTEXT]: COLLECTIONS.CONVERSATIONAL_CONTEXT,
  [MemoryType.CONVERSATION_INSIGHT]: COLLECTIONS.CONVERSATIONAL_CONTEXT,
  [MemoryType.USER_INSTRUCTION]: COLLECTIONS.CONVERSATIONAL_CONTEXT,

  [MemoryType.RELATIONSHIP]: COLLECTIONS.SOCIAL_CONTEXT,
  [MemoryType.LOCATION]: COLLECTIONS.SOCIAL_CONTEXT,

  [MemoryType.INTEREST]: COLLECTIONS.LEARNING_CONTEXT,
  [MemoryType.LEARNING]: COLLECTIONS.LEARNING_CONTEXT,
  [MemoryType.GENERAL]: COLLECTIONS.LEARNING_CONTEXT,
};

const VECTOR_SIZE = 1536; // OpenAI text-embedding-ada-002 dimension

export interface UserMemory {
  id: number; // PostgreSQL memory ID
  embedding: number[];
  content: string;
  type: MemoryTypeEnum;
  metadata: Record<string, any>;
  conversationId?: string;
  confidence: number;
  source: string;
  createdAt: Date;
}

export interface SimilarMemory {
  id: number;
  content: string;
  type: MemoryTypeEnum;
  metadata: Record<string, any>;
  conversationId?: string;
  confidence: number;
  source: string;
  similarity: number;
  createdAt: Date;
}

export interface MemoryContext {
  personal: SimilarMemory[];
  professional: SimilarMemory[];
  conversational: SimilarMemory[];
  social: SimilarMemory[];
  learning: SimilarMemory[];
}

/**
 * Qdrant Vector Database Service for Conversational AI Memory
 *
 * Manages user memories across chat sessions for AI context retrieval
 */
export const createQdrantService = () => {
  return {
    /**
     * Initialize all required collections for conversational AI
     */
    async initializeCollections(): Promise<void> {
      try {
        const collections = Object.values(COLLECTIONS);

        for (const collectionName of collections) {
          await this.ensureCollection(collectionName);
        }

        logger.info("✅ All conversational AI collections initialized");
      } catch (error) {
        logger.error("❌ Failed to initialize collections", { error });
        throw error;
      }
    },

    /**
     * Ensure a collection exists, create if not
     */
    async ensureCollection(collectionName: string): Promise<void> {
      try {
        const collections = await qdrantClient.getCollections();
        const exists = collections.collections.some(
          (c) => c.name === collectionName
        );

        if (!exists) {
          await qdrantClient.createCollection(collectionName, {
            vectors: {
              size: VECTOR_SIZE,
              distance: "Cosine",
            },
            optimizers_config: {
              default_segment_number: 2,
            },
            replication_factor: 1,
          });
          logger.info(`📁 Created collection: ${collectionName}`);
        }
      } catch (error) {
        logger.error(`Failed to ensure collection ${collectionName}`, {
          error,
          collectionName,
        });
        throw error;
      }
    },

    /**
     * Generate embedding for text using OpenAI
     */
    async generateEmbedding(text: string): Promise<number[]> {
      try {
        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: text,
        });

        return response.data[0]?.embedding || [];
      } catch (error) {
        logger.error("Failed to generate embedding", { error });
        throw error;
      }
    },

    /**
     * Store a user memory in Qdrant
     */
    async storeUserMemory(memory: UserMemory): Promise<string> {
      try {
        const collectionName =
          TYPE_TO_COLLECTION[memory.type] || COLLECTIONS.USER_MEMORIES;
        const vectorId = uuidv4();

        const payload = {
          memoryId: memory.id,
          content: memory.content,
          type: memory.type,
          metadata: memory.metadata,
          conversationId: memory.conversationId,
          confidence: memory.confidence,
          source: memory.source,
          createdAt: memory.createdAt.toISOString(),
        };

        const point = {
          id: vectorId,
          vector: memory.embedding,
          payload,
        };

        await qdrantClient.upsert(collectionName, {
          wait: true,
          points: [point],
        });

        // Also store in main collection for cross-context searches
        if (collectionName !== COLLECTIONS.USER_MEMORIES) {
          await qdrantClient.upsert(COLLECTIONS.USER_MEMORIES, {
            wait: true,
            points: [point],
          });
        }

        return vectorId;
      } catch (error) {
        logger.error("Failed to store user memory", { error });
        throw error;
      }
    },

    /**
     * Retrieve relevant memories for AI context
     * This is the main function used by the chat system
     */
    async getRelevantMemories(
      query: string,
      options: {
        limit?: number;
        minScore?: number;
        contextTypes?: (typeof MemoryType)[];
        conversationId?: string;
        includeConversational?: boolean;
      } = {}
    ): Promise<MemoryContext> {
      try {
        const {
          limit: _limit = 10,
          minScore = 0.6,
          contextTypes,
          conversationId,
          includeConversational = true,
        } = options;

        const queryEmbedding = await this.generateEmbedding(query);

        // Build filter
        const filter: any = {
          must: [
            {
              key: "confidence",
              range: {
                gte: 0.5,
              },
            },
          ],
        };

        if (contextTypes && contextTypes.length > 0) {
          filter.must.push({
            key: "type",
            match: {
              any: contextTypes,
            },
          });
        }

        if (conversationId && includeConversational) {
          filter.must.push({
            key: "conversationId",
            match: {
              value: conversationId,
            },
          });
        }

        // Search across all context collections
        const results = await Promise.all([
          this.searchInCollection(
            COLLECTIONS.PERSONAL_CONTEXT,
            queryEmbedding,
            { limit: 3, minScore, filter }
          ),
          this.searchInCollection(
            COLLECTIONS.PROFESSIONAL_CONTEXT,
            queryEmbedding,
            { limit: 3, minScore, filter }
          ),
          this.searchInCollection(
            COLLECTIONS.CONVERSATIONAL_CONTEXT,
            queryEmbedding,
            { limit: 3, minScore, filter }
          ),
          this.searchInCollection(COLLECTIONS.SOCIAL_CONTEXT, queryEmbedding, {
            limit: 2,
            minScore,
            filter,
          }),
          this.searchInCollection(
            COLLECTIONS.LEARNING_CONTEXT,
            queryEmbedding,
            { limit: 2, minScore, filter }
          ),
        ]);

        return {
          personal: results[0],
          professional: results[1],
          conversational: results[2],
          social: results[3],
          learning: results[4],
        };
      } catch (error) {
        logger.error("Failed to get relevant memories", { error });
        return {
          personal: [],
          professional: [],
          conversational: [],
          social: [],
          learning: [],
        };
      }
    },

    /**
     * Search in a specific collection
     */
    async searchInCollection(
      collectionName: string,
      queryEmbedding: number[],
      options: { limit: number; minScore: number; filter?: any }
    ): Promise<SimilarMemory[]> {
      try {
        const searchResult = await qdrantClient.search(collectionName, {
          vector: queryEmbedding,
          limit: options.limit,
          score_threshold: options.minScore,
          filter: options.filter,
        });

        return searchResult.map((point) => ({
          id: point.payload?.memoryId as number,
          content: point.payload?.content as string,
          type: point.payload?.type as MemoryTypeEnum,
          metadata: point.payload?.metadata as Record<string, any>,
          conversationId: point.payload?.conversationId as string,
          confidence: point.payload?.confidence as number,
          source: point.payload?.source as string,
          similarity: point.score!,
          createdAt: new Date(point.payload?.createdAt as string),
        }));
      } catch (error) {
        logger.error(`Failed to search in collection ${collectionName}`, {
          error,
          collectionName,
        });
        return [];
      }
    },

    /**
     * Delete a user memory from Qdrant
     */
    async deleteUserMemory(
      vectorId: string,
      memoryType: MemoryTypeEnum
    ): Promise<void> {
      try {
        const collectionName =
          TYPE_TO_COLLECTION[memoryType] || COLLECTIONS.USER_MEMORIES;

        // Delete from specific collection
        await qdrantClient.delete(collectionName, {
          wait: true,
          points: [vectorId],
        });

        // Delete from main collection
        await qdrantClient.delete(COLLECTIONS.USER_MEMORIES, {
          wait: true,
          points: [vectorId],
        });
      } catch (error) {
        logger.error("Failed to delete user memory", { error });
        throw error;
      }
    },

    /**
     * Get conversation-specific memories
     */
    async getConversationMemories(
      conversationId: string,
      limit: number = 5
    ): Promise<SimilarMemory[]> {
      try {
        const scrollResult = await qdrantClient.scroll(
          COLLECTIONS.USER_MEMORIES,
          {
            filter: {
              must: [
                {
                  key: "conversationId",
                  match: {
                    value: conversationId,
                  },
                },
              ],
            },
            limit,
            with_payload: true,
          }
        );

        return scrollResult.points.map((point) => ({
          id: point.payload?.memoryId as number,
          content: point.payload?.content as string,
          type: point.payload?.type as MemoryTypeEnum,
          metadata: point.payload?.metadata as Record<string, any>,
          conversationId: point.payload?.conversationId as string,
          confidence: point.payload?.confidence as number,
          source: point.payload?.source as string,
          similarity: 1.0, // Not similarity-based search
          createdAt: new Date(point.payload?.createdAt as string),
        }));
      } catch (error) {
        logger.error("Failed to get conversation memories", { error });
        return [];
      }
    },

    /**
     * Health check for Qdrant connection
     */
    async healthCheck(): Promise<boolean> {
      try {
        await qdrantClient.getCollections();
        return true;
      } catch (error) {
        logger.error("Qdrant health check failed", { error });
        return false;
      }
    },
  };
};

export const qdrantService = createQdrantService();
