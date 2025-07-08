import { serviceRegistry } from "../../../registry/service-registry";

// ✅ Modern ES module imports
import { databaseService } from "../../../services/atoms/DatabaseService/database.service";
import { sessionService } from "../../../services/atoms/SessionService/session.service";
import { streamManager } from "../../../services/atoms/StreamManagerService/stream.manager.service";
import { qdrantService } from "../../../services/atoms/QdrantService/qdrant.service";
import { awsService } from "../../integration/services/AWS/aws.service";
import { imageService } from "../../../services/atoms/ImageService/image.service";
import { fileTransferService } from "../../../services/atoms/FileTransferService/file-transfer.service";
import { createSettingsService } from "../../../services/atoms/SettingsService/settings.service";

// Agent services
import { agentService } from "../../../agent/services/AgentService/agent.service";
import { agentFlowService } from "../../../agent/services/AgentFlowService/agent-flow.service";
import { evaluationService } from "../../../services/EvaluationService/evaluation.service";
import { toolRunnerService } from "../../../services/atoms/ToolRunnerService/toolRunner.service";

// DiffService
import { createDiffService } from "../../../services/atoms/DiffService";

// Register core services
const registerCoreServices = () => {
  // Core infrastructure services
  serviceRegistry.register("database", () => databaseService);
  serviceRegistry.register("session", () => sessionService);
  serviceRegistry.register("stream", () => streamManager);
  serviceRegistry.register("qdrant", () => qdrantService);
  serviceRegistry.register("aws", () => awsService);
  serviceRegistry.register("image", () => imageService);
  serviceRegistry.register("fileTransfer", () => fileTransferService);
  serviceRegistry.registerLazy("settings", createSettingsService);

  // Agent services
  serviceRegistry.register("agent", () => agentService);
  serviceRegistry.register("agentFlow", () => agentFlowService);
  serviceRegistry.register("evaluation", () => evaluationService);
  serviceRegistry.register("toolRunner", () => toolRunnerService);
  serviceRegistry.registerLazy("diff", createDiffService);
};

// Domain-specific service accessors (functional style)
const createCoreServices = () => {
  return {
    database: () => databaseService,
    session: () => sessionService,
    stream: () => streamManager,
    qdrant: () => qdrantService,
    aws: () => awsService,
    image: () => imageService,
    fileTransfer: () => fileTransferService,
    settings: createSettingsService,
    agent: () => agentService,
    agentFlow: () => agentFlowService,
    evaluation: () => evaluationService,
    toolRunner: () => toolRunnerService,
    diff: createDiffService,
  };
};

// Initialize services on import
registerCoreServices();

// Export domain services
export const coreServices = createCoreServices();

// Individual exports for convenience
export const {
  database,
  session,
  stream,
  qdrant,
  aws,
  image,
  fileTransfer,
  settings,
  agent,
  agentFlow,
  evaluation,
  toolRunner,
  diff,
} = coreServices;

// Type exports
export type CoreServices = {
  database: typeof databaseService;
  session: typeof sessionService;
  stream: typeof streamManager;
  qdrant: typeof qdrantService;
  aws: typeof awsService;
  image: typeof imageService;
  fileTransfer: typeof fileTransferService;
  settings: ReturnType<typeof createSettingsService>;
  agent: typeof agentService;
  agentFlow: typeof agentFlowService;
  evaluation: typeof evaluationService;
  toolRunner: typeof toolRunnerService;
  diff: ReturnType<typeof createDiffService>;
};
