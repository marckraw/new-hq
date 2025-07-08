import { MemoryEntry } from "./types";

/**
 * Memory store interface
 */
export interface MemoryStore {
  store(entry: MemoryEntry): Promise<void>;
  retrieve(id: string): Promise<MemoryEntry | null>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * In-memory implementation of MemoryStore (for development/testing)
 */
export class InMemoryStore implements MemoryStore {
  private entries: Map<string, MemoryEntry> = new Map();

  async store(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async retrieve(id: string): Promise<MemoryEntry | null> {
    return this.entries.get(id) || null;
  }

  async search(query: string, limit = 10): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];

    for (const entry of this.entries.values()) {
      // Simple text search (in real implementation, use embeddings)
      if (entry.content.toLowerCase().includes(query.toLowerCase())) {
        results.push(entry);
      }
    }

    // Sort by relevance score (if available) or timestamp
    results.sort((a, b) => {
      if (a.relevanceScore !== undefined && b.relevanceScore !== undefined) {
        return b.relevanceScore - a.relevanceScore;
      }
      return b.timestamp - a.timestamp;
    });

    return results.slice(0, limit);
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

/**
 * Memory Manager class for handling different types of memory
 */
export class MemoryManager {
  private store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  /**
   * Add a new memory entry
   */
  async addMemory(
    content: string,
    type: MemoryEntry["type"],
    metadata?: Record<string, any>,
    embedding?: number[]
  ): Promise<string> {
    const entry: MemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      content,
      embedding,
      metadata,
      timestamp: Date.now(),
    };

    await this.store.store(entry);
    return entry.id;
  }

  /**
   * Retrieve a memory by ID
   */
  async getMemory(id: string): Promise<MemoryEntry | null> {
    return await this.store.retrieve(id);
  }

  /**
   * Search memories by content
   */
  async searchMemories(query: string, limit = 10): Promise<MemoryEntry[]> {
    return await this.store.search(query, limit);
  }

  /**
   * Get recent memories of a specific type
   */
  async getRecentMemories(
    type: MemoryEntry["type"],
    limit = 5
  ): Promise<MemoryEntry[]> {
    // In a real implementation, this would be more efficient with proper indexing
    const allMemories = await this.store.search("", 1000); // Get all memories
    return allMemories
      .filter((entry) => entry.type === type)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Delete a memory
   */
  async deleteMemory(id: string): Promise<void> {
    await this.store.delete(id);
  }

  /**
   * Clear all memories
   */
  async clearMemories(): Promise<void> {
    await this.store.clear();
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<MemoryEntry["type"], number>;
  }> {
    const allMemories = await this.store.search("", 10000); // Get all memories
    const byType: Record<MemoryEntry["type"], number> = {
      short_term: 0,
      long_term: 0,
      episodic: 0,
      semantic: 0,
    };

    allMemories.forEach((entry) => {
      byType[entry.type]++;
    });

    return {
      total: allMemories.length,
      byType,
    };
  }
}

/**
 * Create a memory manager with in-memory storage
 */
export function createMemoryManager(store?: MemoryStore): MemoryManager {
  return new MemoryManager(store || new InMemoryStore());
}

/**
 * Create a memory entry
 */
export function createMemoryEntry(
  content: string,
  type: MemoryEntry["type"],
  metadata?: Record<string, any>,
  embedding?: number[]
): MemoryEntry {
  return {
    id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    content,
    embedding,
    metadata,
    timestamp: Date.now(),
  };
}
