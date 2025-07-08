// ✅ IMPORTANT: Import service registrations FIRST - before any routes that use services
import "./domains/core/services/index";
import "./domains/communication/services/index";
import "./domains/ai/services/index";
import "./domains/workflow/services/index";
import "./domains/integration/services/index";
import "./domains/irf/services/index";
import { serve } from "@hono/node-server";
import { Context, Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { config } from "./config.env";
import {
  createLoggerMiddleware,
  shouldEnableHttpLogging,
} from "./middleware/pino-logger";
import { prettyJSON } from "hono/pretty-json";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/error";
import { bodyLimit } from "./middleware/upload";
import { rateLimit } from "./middleware/rate-limit";
import { sessionService } from "./services/atoms/SessionService/session.service";
import { logger } from "./utils/logger";

// ✅ Now import API router - services are already registered
import apiRouter from "./routes/api";

import { setupEventListeners } from "./eda/events/listeners";
import { initializeUnifiedTools } from "./agent/tools/unified/initialize-unified-tools";
import { registerOrchestratorAgent } from "./agent/factories/OrchestratorAgent";
import { initializeAgents } from "./agent/initialize-agents";

// Initialize event listeners
setupEventListeners();

// Initialize agent system (agents + tools + orchestrator)
const initializeAgentSystem = async () => {
  try {
    // Step 1: Initialize and register all agents
    await initializeAgents();
    
    // Step 2: Register the orchestrator (needs other agents to be registered first)
    registerOrchestratorAgent();
    
    // Step 3: Initialize unified tools (includes agent tools)
    await initializeUnifiedTools();
    
    logger.info("🚀 Agent system fully initialized!");
  } catch (error) {
    logger.error("❌ Failed to initialize agent system", error);
  }
};

// Start initialization
initializeAgentSystem();

// Start session cleanup service
sessionService.startCleanup();

// Debug: Check what the environment and log level are set to
logger.info("🔧 Environment", { environment: config.NODE_ENV });
logger.info("🔧 Log Level", { logLevel: config.LOG_LEVEL });

const app = new Hono();

// HTTP Request Logging - Only enable for verbose levels
if (shouldEnableHttpLogging()) {
  logger.info("🔧 Enabling detailed HTTP logging");
  app.use("*", honoLogger()); // Built-in Hono logger for detailed HTTP requests
}

// Apply the intelligent logger middleware
app.use("*", createLoggerMiddleware());

app.use("*", prettyJSON());
app.use(
  "/*",
  cors({
    origin: [
      "https://horizon.ef.design",
      "http://localhost:8081",
      "https://horizon.mrck.dev",
      "https://hq-thehorizon.vercel.app",
      "https://plugins.storyblok.com",
      "http://localhost:8080",
      "http://localhost:6006",
      "http://localhost:5173",
      "https://localhost:8080",
      "http://localhost:4000",
      "https://gc-agent-production.up.railway.app",
      "https://do-not-talk-about-this.vercel.app",
      "https://gc-agent-component.vercel.app",
    ], // Add your frontend URL
    allowMethods: ["POST", "GET", "OPTIONS", "DELETE", "PUT", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
    maxAge: 600,
    credentials: true,
  })
);
app.use("*", errorHandler());
app.use(
  "*", // Limit of the upload file size
  bodyLimit({
    maxSize: 50 * 1024 * 1024, // 50MB
    onError: (c: Context) => c.text("File too large", 413),
  })
);
app.use(
  "*",
  rateLimit({
    max: 100, // 50 requests
    window: 60, // per 60 seconds
    message: "Rate limit exceeded. Please try again later.",
  })
);

app.route("/api", apiRouter); // api router - this is the route with Authorization header

export type AppType = typeof app;

const port = parseInt(config.PORT) || 3000;

serve({
  fetch: app.fetch,
  port,
});

logger.info(`Server is running on port ${port}`, { port });
logger.info("Session cleanup service", {
  status: sessionService.getCleanupStatus(),
});
