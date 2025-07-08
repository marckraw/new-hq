import { logger } from "@/utils/logger";
import { unifiedToolsRegistry } from "./unified-tools.registry";
import { createAllAgentTools } from "../agent-tool.factory";

/**
 * Initialize the unified tool system
 * This should be called during application startup
 */
export const initializeUnifiedTools = async () => {
  try {
    logger.info("Initializing unified tool system");
    
    // Initialize the unified tools registry (local tools)
    await unifiedToolsRegistry.initialize();
    
    // Register agent tools for all callable agents
    const agentTools = createAllAgentTools();
    agentTools.forEach(tool => {
      unifiedToolsRegistry.runner.registerTool(tool);
    });
    
    logger.info(`Registered ${agentTools.length} agent tools`);
    
    // Log summary
    const localTools = unifiedToolsRegistry.runner.getLocalTools();
    const agentToolsList = unifiedToolsRegistry.runner.getAgentTools();
    const mcpTools = unifiedToolsRegistry.runner.getMCPTools();
    
    logger.info("Unified tool system initialized", {
      localTools: localTools.length,
      agentTools: agentToolsList.length,
      mcpTools: mcpTools.length,
      totalTools: localTools.length + agentToolsList.length + mcpTools.length,
    });
    
    return true;
  } catch (error) {
    logger.error("Failed to initialize unified tool system", error);
    throw error;
  }
};