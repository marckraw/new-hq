import { logger } from "@/utils/logger";
import { eventBus } from "@/eda/events/event-bus";
import { serviceRegistry } from "@/registry/service-registry";
import { constructFinalStoryblokStory } from "../FigmaToStoryblokAgent/helpers";
import { Agent } from "../agents.factory.types";
import { validateIRF, generateAgentFeedback } from "./validation";
import { irfTraversingService } from "@/domains/irf/services/IRFTraversingService/irf-traversing.service";
import { createConfigurableAgent, CustomHandlers } from "../configurable-agent.factory";
import { irfArchitectAgentConfig, irfArchitectAgentMetadata } from "./irf-architect.config";

// Re-export metadata for backward compatibility
export { irfArchitectAgentMetadata };

/**
 * Custom handlers for the IRF Architect Agent
 * Handles validation, IRF enrichment, and Storyblok transformation
 */
const createIRFArchitectHandlers = (): CustomHandlers => {
  const irfToStoryblokService = serviceRegistry.get("irfToStoryblok");
  
  return {
    // Validate IRF response using the validation service
    validateResponse: async (response) => {
      try {
        const irfResult = response.content ? JSON.parse(response.content) : {};
        const validationResult = validateIRF(irfResult);
        
        if (!validationResult.isValid) {
          logger.info(`❌ IRF validation failed`, {
            errors: validationResult.errors.length,
            warnings: validationResult.warnings.length,
          });
          
          // Log detailed validation errors
          logger.error("IRF validation errors:", {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
            feedback: generateAgentFeedback(validationResult),
          });
          
          return {
            isValid: false,
            errors: [generateAgentFeedback(validationResult)],
          };
        }
        
        logger.info(`✅ IRF validation passed`);
        return { isValid: true };
      } catch (error) {
        logger.error("Failed to parse or validate IRF response:", error);
        return {
          isValid: false,
          errors: [`Failed to parse JSON response: ${error}`],
        };
      }
    },
    
    // Transform validated IRF through enrichment and Storyblok conversion
    transformOutput: async (response) => {
      try {
        const irfResult = JSON.parse(response.content);
        
        // Double-check validation before transformation
        const validationResult = validateIRF(irfResult);
        if (!validationResult.isValid) {
          logger.warn("IRF validation failed in transformOutput, skipping transformation");
          logger.error("Validation errors in transformOutput:", {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          });
          return response; // Return original response without transformation
        }
        
        // Enrich IRF with traversing service
        const enrichedIRF = await irfTraversingService.traverseAndEnrich(
          irfResult,
          {
            enrichWithParent: true,
            validateNodes: false,
          }
        );
        
        // Transform IRF to Storyblok
        const storyblokTransformationResult =
          await irfToStoryblokService.transformIRFToStoryblok(
            enrichedIRF.enrichedLayout,
            {
              includeMetadata: true,
              storyName: `IRF Architect - ${new Date().getTime()}`,
            }
          );
        
        // Construct final Storyblok story
        const finalStoryblokStory = constructFinalStoryblokStory(
          storyblokTransformationResult,
          {
            storySlug: `irf-architect-${new Date().getTime()}`,
            storyName: `IRF Architect - ${new Date().getTime()}`,
          }
        );
        
        // Emit event for downstream processing
        // @ts-ignore
        eventBus.emit("figma-to-storyblok.ready", {
          irfResult: enrichedIRF.enrichedLayout,
          finalStoryblokStory: finalStoryblokStory,
          metadata: {
            figmaFileName: "Untitled",
            componentCount: 1,
            nodeCount: 1,
            storyName: storyblokTransformationResult.story.name,
            storySlug: storyblokTransformationResult.story.slug,
          },
        });
        
        // Return enriched response
        return {
          role: "assistant",
          content: JSON.stringify({
            irf: enrichedIRF.enrichedLayout,
            storyblok: finalStoryblokStory,
          }),
        };
      } catch (error) {
        logger.error("Failed to transform IRF output:", error);
        // Return original response if transformation fails
        return response;
      }
    },
    
    // Handle errors during IRF generation
    onError: async (error, attempt) => {
      logger.error(`IRF generation error on attempt ${attempt}:`, error);
      
      // Let the framework handle retries based on maxRetries config
      // Return the error to be included in the next attempt's context
      return {
        error: error.message || String(error),
        attempt,
      };
    },
  };
};

/**
 * Create IRF Architect Agent using the config-driven approach
 * Preserves all custom logic while leveraging the new architecture
 */
export const createIRFArchitectAgent = async (): Promise<Agent> => {
  const customHandlers = createIRFArchitectHandlers();
  
  return createConfigurableAgent({
    config: irfArchitectAgentConfig,
    customHandlers,
  });
};
