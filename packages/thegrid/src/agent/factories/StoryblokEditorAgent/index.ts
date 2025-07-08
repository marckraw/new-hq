import { logger } from "@/utils/logger";
import { eventBus } from "@/eda/events/event-bus";
import { serviceRegistry } from "@/registry/service-registry";
import { Agent } from "../agents.factory.types";
import { validateIRF, generateAgentFeedback } from "../IRFArchitectAgent/validation";
import { irfTraversingService } from "@/domains/irf/services/IRFTraversingService/irf-traversing.service";
import { exampleData } from "@/domains/irf/example-data";
import { createConfigurableAgent, CustomHandlers } from "../configurable-agent.factory";
import { storyblokEditorAgentConfig, storyblokEditorAgentMetadata } from "./storyblok-editor.config";

// Re-export metadata for backward compatibility
export { storyblokEditorAgentMetadata };

// Interface for preprocessed data
interface PreprocessedStoryblokData {
  storyblokContent: any;
  irfLayout: any;
  editInstructions: string;
  metadata: {
    source: "api" | "example";
    space?: string;
    story?: string;
  };
}

/**
 * Custom handlers for the Storyblok Editor Agent
 * Handles Storyblok fetching, IRF transformations, validation, and event emission
 */
const createStoryblokEditorHandlers = (): CustomHandlers => {
  const storyblokToIRFService = serviceRegistry.get("storyblokToIRF");
  const irfToStoryblokService = serviceRegistry.get("irfToStoryblok");
  const storyblokService = serviceRegistry.get("storyblok");
  
  let preprocessedData: PreprocessedStoryblokData | null = null;
  
  return {
    // Transform input to fetch Storyblok content and convert to IRF
    transformInput: async (input) => {
      const firstMessage = input.messages[0];
      if (!firstMessage) {
        throw new Error("No messages provided in input");
      }
      
      // Extract edit instructions from the message
      const editInstructions = firstMessage.content;
      
      // Check if we have contextData with Storyblok selections
      const contextData = input.context?.sessionData?.contextData;
      let storyblokContent;
      let metadata: PreprocessedStoryblokData["metadata"];
      
      if (contextData?.selectedSpace && contextData?.selectedStory) {
        // Use real Storyblok content from API
        logger.info("🔍 Fetching real Storyblok content from API...", {
          space: contextData.selectedSpace,
          story: contextData.selectedStory,
        });
        
        try {
          // Debug: List stories to verify
          logger.info("🔍 DEBUG: Fetching all stories from space to verify story exists...");
          const allStories = await storyblokService.getAllStoriesFromSpace(
            contextData.selectedSpace
          );
          logger.info(`📋 Found ${allStories.length} stories in space ${contextData.selectedSpace}`);
          
          // Log first few stories
          allStories.slice(0, 5).forEach((story) => {
            logger.info(`  - Story ID: ${story.id}, Name: "${story.name}", Slug: "${story.slug}"`);
          });
          
          // Check if target story exists
          const targetStory = allStories.find(
            (story) => story.id.toString() === contextData.selectedStory
          );
          if (targetStory) {
            logger.info(`✅ Found target story: ID ${targetStory.id}, Name: "${targetStory.name}"`);
          } else {
            logger.warn(`❌ Target story ${contextData.selectedStory} NOT found in space ${contextData.selectedSpace}`);
            logger.info("Available story IDs:", allStories.map((s) => s.id.toString()));
          }
          
          // Fetch the actual story content
          const storyContent = await storyblokService.getStoryContent(
            contextData.selectedSpace,
            contextData.selectedStory
          );
          
          if (!storyContent) {
            throw new Error("Failed to fetch story content from Storyblok API");
          }
          
          storyblokContent = storyContent;
          metadata = {
            source: "api",
            space: contextData.selectedSpace,
            story: contextData.selectedStory,
          };
          
          logger.info("✅ Successfully fetched real Storyblok content");
        } catch (error) {
          logger.warn("⚠️ Failed to fetch real Storyblok content, falling back to example data", error);
          // Fallback to example data
          storyblokContent = { ...exampleData.story };
          metadata = { source: "example" };
        }
      } else {
        // Fallback to example data when no contextData is provided
        logger.info("📝 No contextData provided, using example Storyblok data");
        storyblokContent = { ...exampleData.story };
        metadata = { source: "example" };
      }
      
      // Transform Storyblok to IRF
      logger.info("🔄 Transforming Storyblok to IRF...");
      const irfTransformationResult = await storyblokToIRFService.transformStoryblokToIRF(
        // @ts-ignore
        storyblokContent,
        {
          includeMetadata: true,
          globalVars: {},
        }
      );
      
      if (!irfTransformationResult.success) {
        throw new Error(
          `Failed to transform Storyblok to IRF: ${irfTransformationResult.errors?.join(", ")}`
        );
      }
      
      logger.info("✅ Storyblok to IRF transformation successful");
      
      // Store preprocessed data for later use
      preprocessedData = {
        storyblokContent,
        irfLayout: irfTransformationResult.irfLayout,
        editInstructions,
        metadata,
      };
      
      // Modify the input messages to include the IRF data
      return {
        ...input,
        messages: [
          {
            role: "system" as const,
            content: input.messages.find((m: any) => m.role === "system")?.content || "",
          },
          {
            role: "user" as const,
            content: `Here is the current IRF structure converted from Storyblok:

${JSON.stringify(irfTransformationResult.irfLayout, null, 2)}

Edit Instructions: ${editInstructions || "Please make improvements to the content structure"}

Please return the modified IRF structure as JSON.`,
          },
        ],
      };
    },
    
    // Validate the modified IRF response
    validateResponse: async (response) => {
      try {
        const modifiedIRF = response.content ? JSON.parse(response.content) : {};
        const validationResult = validateIRF(modifiedIRF);
        
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
    
    // Transform validated IRF back to Storyblok
    transformOutput: async (response) => {
      if (!preprocessedData) {
        logger.error("No preprocessed data available for transformation");
        return response;
      }
      
      try {
        const modifiedIRF = JSON.parse(response.content);
        
        // Double-check validation before transformation
        const validationResult = validateIRF(modifiedIRF);
        if (!validationResult.isValid) {
          logger.warn("IRF validation failed in transformOutput, skipping transformation");
          logger.error("Validation errors in transformOutput:", {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          });
          preprocessedData = null; // Clear preprocessed data
          return response; // Return original response without transformation
        }
        
        // Enrich the IRF
        const enrichedIRF = await irfTraversingService.traverseAndEnrich(
          modifiedIRF,
          {
            enrichWithParent: true,
            validateNodes: false,
          }
        );
        
        // Transform back to Storyblok
        logger.info("🔄 Transforming modified IRF back to Storyblok...");
        const storyblokTransformationResult = await irfToStoryblokService.transformIRFToStoryblok(
          enrichedIRF.enrichedLayout,
          {
            includeMetadata: true,
            storyName: preprocessedData.storyblokContent.name,
            storySlug: preprocessedData.storyblokContent.slug,
          }
        );
        
        if (!storyblokTransformationResult.success) {
          throw new Error(
            `Failed to transform IRF back to Storyblok: ${storyblokTransformationResult.errors?.join(", ")}`
          );
        }
        
        logger.info("✅ IRF to Storyblok transformation successful");
        
        // Emit event for integration
        eventBus.emit("storyblok-editor.completed", {
          originalStoryblok: preprocessedData.storyblokContent,
          irf: enrichedIRF.enrichedLayout,
          editedStoryblok: storyblokTransformationResult.story,
          metadata: {
            transformationTime: new Date().toISOString(),
            originalComponentCount: storyblokTransformationResult.metadata.componentCount,
            finalComponentCount: storyblokTransformationResult.metadata.componentCount,
            storyName: preprocessedData.storyblokContent.name,
            storySlug: preprocessedData.storyblokContent.slug,
          },
        });
        
        // Return enriched response
        return {
          role: "assistant",
          content: JSON.stringify({
            success: true,
            originalStoryblok: preprocessedData.storyblokContent,
            irf: enrichedIRF.enrichedLayout,
            editedStoryblok: storyblokTransformationResult.story,
            metadata: {
              transformationTime: new Date().toISOString(),
              originalComponentCount: storyblokTransformationResult.metadata.componentCount,
              finalComponentCount: storyblokTransformationResult.metadata.componentCount,
              source: preprocessedData.metadata.source,
            },
          }),
        };
      } catch (error) {
        logger.error("Failed to transform Storyblok output:", error);
        // Return original response if transformation fails
        return response;
      } finally {
        // Clear preprocessed data
        preprocessedData = null;
      }
    },
    
    // Handle errors during processing
    onError: async (error, attempt) => {
      logger.error(`Storyblok editing error on attempt ${attempt}:`, error);
      
      // Clear preprocessed data on error
      preprocessedData = null;
      
      // Let the framework handle retries based on maxRetries config
      return {
        error: error.message || String(error),
        attempt,
      };
    },
  };
};

/**
 * Create Storyblok Editor Agent using the config-driven approach
 * Preserves all custom logic while leveraging the new architecture
 */
export const createStoryblokEditorAgent = async (): Promise<Agent> => {
  const customHandlers = createStoryblokEditorHandlers();
  
  return createConfigurableAgent({
    config: storyblokEditorAgentConfig,
    customHandlers,
  });
};