import { pageTransformer } from "./page.transformer";
import { sectionTransformer } from "./section.transformer";
import { blockquoteTransformer } from "./blockquote/blockquote.transformer";
import { textTransformer } from "./text.transformer";
import { flexGroupTransformer } from "./flex-group.transformer";
import { accordionTransformer } from "./accordion.transformer";
import { accordionItemTransformer } from "./accordion-item.transformer";
import { headlineTransformer } from "./headline.transformer";
import { imageTransformer } from "./image.transformer";
import { dividerTransformer } from "./divider.transformer";
import { editorialCardTransformer } from "./editorial-card.transformer";
import { listTransformer } from "./list.transformer";
import { listItemTransformer } from "./list-item.transformer";
import { groupTransformer } from "./group.transformer";
import { shapeTransformer } from "./shape.transformer";
import { instanceTransformer } from "./instance.transformer";
import { ComponentRegistryEntry } from "../irf-to-storyblok.service.types";

export const componentRegistry: Record<string, ComponentRegistryEntry> = {
  page: {
    defaultStoryblokComponent: "page",
    transform: pageTransformer,
  },

  section: {
    defaultStoryblokComponent: "sb-section",
    transform: sectionTransformer,
  },

  blockquote: {
    defaultStoryblokComponent: "sb-blockquote-section",
    transform: blockquoteTransformer,
  },

  text: {
    defaultStoryblokComponent: "sb-text-section",
    transform: textTransformer,
  },

  "flex-group": {
    defaultStoryblokComponent: "sb-flex-group",
    transform: flexGroupTransformer,
  },

  accordion: {
    defaultStoryblokComponent: "sb-accordion",
    transform: accordionTransformer,
  },

  "accordion-item": {
    defaultStoryblokComponent: "sb-accordion-item",
    transform: accordionItemTransformer,
  },

  headline: {
    defaultStoryblokComponent: "sb-headline",
    transform: headlineTransformer,
  },

  image: {
    defaultStoryblokComponent: "sb-image-section",
    transform: imageTransformer,
  },

  divider: {
    defaultStoryblokComponent: "sb-divider",
    transform: dividerTransformer,
  },

  "editorial-card": {
    defaultStoryblokComponent: "sb-editorial-card-section",
    transform: editorialCardTransformer,
  },

  list: {
    defaultStoryblokComponent: "sb-list-section",
    transform: listTransformer,
  },
  "list-item": {
    defaultStoryblokComponent: "sb-list-item",
    transform: listItemTransformer,
  },

  group: {
    defaultStoryblokComponent: "sb-group",
    transform: groupTransformer,
  },

  shape: {
    defaultStoryblokComponent: "sb-shape",
    transform: shapeTransformer,
  },

  instance: {
    defaultStoryblokComponent: "sb-component-instance",
    transform: instanceTransformer,
  },
};
