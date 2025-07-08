import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  jsonb,
  integer,
  real,
} from "drizzle-orm/pg-core";

// User memories for conversational AI
export const userMemories = pgTable("user_memories", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),

  // Conversational context
  conversationId: varchar("conversation_id", { length: 255 }),
  confidence: real("confidence").notNull().default(1.0), // 0.0 to 1.0
  source: varchar("source", { length: 50 }).notNull().default("user_explicit"), // user_explicit, ai_inferred, conversation_analysis

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // Vector embedding reference (stored in Qdrant)
  vectorId: varchar("vector_id", { length: 255 }), // Reference to Qdrant point ID
});

// Tags for memories (many-to-many)
export const memoryTags = pgTable("memory_tags", {
  id: serial("id").primaryKey(),
  memoryId: integer("memory_id")
    .references(() => userMemories.id, { onDelete: "cascade" })
    .notNull(),
  tag: varchar("tag", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Memory retrieval logs (for improving the RAG system)
export const memoryRetrievals = pgTable("memory_retrievals", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  memoryIds: jsonb("memory_ids").notNull(), // Array of retrieved memory IDs
  conversationId: varchar("conversation_id", { length: 255 }),
  retrievalType: varchar("retrieval_type", { length: 50 }).notNull(), // semantic, tag, hybrid
  scores: jsonb("scores"), // Similarity scores for each retrieved memory
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
