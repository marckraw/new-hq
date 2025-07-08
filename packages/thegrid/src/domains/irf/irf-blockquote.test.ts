import { describe, it, expect, beforeAll } from "vitest";
import { serviceRegistry } from "@/registry/service-registry";
import { IntermediateLayout } from "./schema.types";
import { IRFToStoryblokService } from "./services/IRFToStoryblokService/irf-to-storyblok.service.types";
import { StoryblokToIRFService } from "./services/StoryblokToIRFService/storyblok-to-irf.service.types";
import { registerIRFServices } from "./services";

// Mock dependencies
const createMockDesignIntentMapperService = () => ({
  map: (design: unknown, _componentType: string) => design,
});

const createMockAssetService = () => ({
  handleUpload: async (_imageRef: string, _name: string) => "https://a.storyblok.com/f/test/image.jpg",
  prefetchImageFills: async (_fileKey: string) => {},
});

describe("Blockquote IRF Tests", () => {
  let irfToStoryblokService: IRFToStoryblokService;
  let storyblokToIRFService: StoryblokToIRFService;

  beforeAll(() => {
    // Register all IRF services first
    registerIRFServices();
    
    // Override with mock services as needed
    serviceRegistry.mock("designIntentMapper", createMockDesignIntentMapperService());
    serviceRegistry.mock("asset", createMockAssetService());

    irfToStoryblokService = serviceRegistry.get("irfToStoryblok");
    storyblokToIRFService = serviceRegistry.get("storyblokToIRF");
  });

  describe("Blockquote in Section", () => {
    it("should transform blockquote in section to sb-blockquote-section", async () => {
      const testLayout: IntermediateLayout = {
        version: "1.0",
        name: "Blockquote Test",
        content: [
          {
            type: "page",
            name: "Test Page",
            children: [
              {
                type: "section",
                name: "Quote Section",
                children: [
                  {
                    type: "blockquote",
                    name: "Famous Quote",
                    props: {
                      content: "The only way to do great work is to love what you do.",
                      quote: "The only way to do great work is to love what you do.",
                      citation: "Steve Jobs",
                      author: "Steve Jobs",
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await irfToStoryblokService.transformIRFToStoryblok(testLayout);

      expect(result.success).toBe(true);
      const blockquoteComponent = result.story.content.body[0].content[0];
      expect(blockquoteComponent.component).toBe("sb-blockquote-section");
      expect(blockquoteComponent.content.content[0].content[0].text).toBe(
        "The only way to do great work is to love what you do."
      );
      expect(blockquoteComponent.citation.content[0].content[0].text).toBe("Steve Jobs");
    });
  });

  describe("Blockquote in Flex Group", () => {
    it("should transform blockquote in flex-group to sb-blockquote-flex-group", async () => {
      const testLayout: IntermediateLayout = {
        version: "1.0",
        name: "Blockquote Flex Test",
        content: [
          {
            type: "page",
            name: "Test Page",
            children: [
              {
                type: "section",
                name: "Container Section",
                children: [
                  {
                    type: "flex-group",
                    name: "Quote Group",
                    children: [
                      {
                        type: "blockquote",
                        name: "Inspirational Quote",
                        props: {
                          content: "Innovation distinguishes between a leader and a follower.",
                          citation: "Steve Jobs",
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await irfToStoryblokService.transformIRFToStoryblok(testLayout);

      expect(result.success).toBe(true);
      const flexGroup = result.story.content.body[0].content[0];
      const blockquoteComponent = flexGroup.content[0];
      expect(blockquoteComponent.component).toBe("sb-blockquote-flex-group");
    });
  });

  describe("Blockquote in Accordion Item", () => {
    it("should transform blockquote in accordion-item slot to sb-blockquote", async () => {
      const testLayout: IntermediateLayout = {
        version: "1.0",
        name: "Blockquote Accordion Test",
        content: [
          {
            type: "page",
            name: "Test Page",
            children: [
              {
                type: "section",
                name: "FAQ Section",
                children: [
                  {
                    type: "accordion",
                    name: "Quotes Accordion",
                    children: [
                      {
                        type: "accordion-item",
                        name: "Quote Item",
                        slots: {
                          title: [
                            {
                              type: "text",
                              name: "Title",
                              props: {
                                text: "Famous Quotes",
                              },
                            },
                          ],
                          content: [
                            {
                              type: "text",
                              name: "Intro",
                              props: {
                                text: "Here are some famous quotes:",
                              },
                            },
                            {
                              type: "blockquote",
                              name: "Quote 1",
                              props: {
                                content: "Stay hungry, stay foolish.",
                                author: "Steve Jobs",
                              },
                            },
                            {
                              type: "divider",
                              name: "Separator",
                            },
                            {
                              type: "blockquote",
                              name: "Quote 2",
                              props: {
                                content: "Think different.",
                                citation: "Apple Inc.",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await irfToStoryblokService.transformIRFToStoryblok(testLayout);

      expect(result.success).toBe(true);
      const accordionItem = result.story.content.body[0].content[0].items[0];
      expect(accordionItem.content).toHaveLength(4);
      expect(accordionItem.content[1].component).toBe("sb-blockquote");
      expect(accordionItem.content[3].component).toBe("sb-blockquote");
    });
  });

  describe("Blockquote Round-Trip Transformation", () => {
    it("should maintain blockquote type through round-trip transformation", async () => {
      const originalIRF: IntermediateLayout = {
        version: "1.0",
        name: "Blockquote Round-Trip",
        content: [
          {
            type: "page",
            name: "Test Page",
            children: [
              {
                type: "section",
                name: "Quotes Section",
                children: [
                  {
                    type: "headline",
                    name: "Section Title",
                    props: {
                      text: "Quotes Collection",
                    },
                  },
                  {
                    type: "blockquote",
                    name: "Main Quote",
                    props: {
                      content: "The future belongs to those who believe in the beauty of their dreams.",
                      quote: "The future belongs to those who believe in the beauty of their dreams.",
                      citation: "Eleanor Roosevelt",
                      author: "Eleanor Roosevelt",
                    },
                  },
                  {
                    type: "text",
                    name: "Commentary",
                    props: {
                      text: "This quote inspires us to dream big.",
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      // Transform to Storyblok
      const storyblokResult = await irfToStoryblokService.transformIRFToStoryblok(originalIRF);
      expect(storyblokResult.success).toBe(true);

      // Transform back to IRF
      const irfResult = await storyblokToIRFService.transformStoryblokToIRF(storyblokResult.story);
      expect(irfResult.success).toBe(true);

      // Verify blockquote maintained its type
      const section = irfResult.irfLayout.content[0].children![0];
      expect(section.children).toHaveLength(3);
      
      const blockquote = section.children![1];
      expect(blockquote.type).toBe("blockquote"); // Should be blockquote, not text
      expect(blockquote.props.content).toBe("The future belongs to those who believe in the beauty of their dreams.");
      expect(blockquote.props.citation).toBe("Eleanor Roosevelt");
      expect(blockquote.props.author).toBe("Eleanor Roosevelt");
    });

    it("should handle blockquote in different contexts through round-trip", async () => {
      const originalIRF: IntermediateLayout = {
        version: "1.0",
        name: "Multi-Context Blockquote",
        content: [
          {
            type: "page",
            name: "Test Page",
            children: [
              {
                type: "section",
                name: "Mixed Content",
                children: [
                  {
                    type: "blockquote",
                    name: "Section Quote",
                    props: {
                      content: "Quote in section",
                      author: "Author 1",
                    },
                  },
                  {
                    type: "flex-group",
                    name: "Flex Content",
                    children: [
                      {
                        type: "blockquote",
                        name: "Flex Quote",
                        props: {
                          content: "Quote in flex group",
                          author: "Author 2",
                        },
                      },
                    ],
                  },
                  {
                    type: "accordion",
                    name: "Accordion Content",
                    children: [
                      {
                        type: "accordion-item",
                        name: "Item",
                        slots: {
                          title: [
                            {
                              type: "text",
                              name: "Title",
                              props: { text: "Quotes" },
                            },
                          ],
                          content: [
                            {
                              type: "blockquote",
                              name: "Accordion Quote",
                              props: {
                                content: "Quote in accordion",
                                author: "Author 3",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      // Round-trip transformation
      const storyblokResult = await irfToStoryblokService.transformIRFToStoryblok(originalIRF);
      const irfResult = await storyblokToIRFService.transformStoryblokToIRF(storyblokResult.story);

      expect(irfResult.success).toBe(true);

      const section = irfResult.irfLayout.content[0].children![0];
      
      // Check section blockquote
      expect(section.children![0].type).toBe("blockquote");
      expect(section.children![0].props.content).toBe("Quote in section");
      
      // Check flex-group blockquote
      expect(section.children![1].children![0].type).toBe("blockquote");
      expect(section.children![1].children![0].props.content).toBe("Quote in flex group");
      
      // Check accordion-item blockquote
      const accordionItem = section.children![2].children![0];
      expect(accordionItem.slots!.content[0].type).toBe("blockquote");
      expect(accordionItem.slots!.content[0].props.content).toBe("Quote in accordion");
    });
  });
});