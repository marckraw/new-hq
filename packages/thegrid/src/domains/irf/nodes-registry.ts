/**
 * This is the nodes registry, that defines the available component types and their properties.
 * Core for the IRF Architect Agent to understand what can be nested where, and how.
 *
 * Whenever we add additional component support, or any other extension to the schema validation
 * we should modify this file with changes. It is then used by Master prompt and help LLMs understand the intent.
 */

import { IntermediateNodeType, AllowedNamedSlots } from "./schema.types";

// Type for node registry entries
export interface NodeRegistryEntry {
  name: string;
  description: string;
  // Components can have EITHER allowedChildren OR allowedNamedSlots, not both
  allowedChildren?: IntermediateNodeType[];
  allowedNamedSlots?: AllowedNamedSlots;
  props?: Record<string, string>; // Prop name to type mapping
}

export const nodesRegistry: Record<IntermediateNodeType, NodeRegistryEntry> = {
  // Root level components
  page: {
    name: "page",
    description: "A page is the root component of a Storyblok page.",
    allowedChildren: ["section", "header", "footer"],
  },

  // Container components
  section: {
    name: "section",
    description: "A section is a container for content.",
    allowedChildren: [
      "headline",
      "text",
      "image",
      "list",
      "divider",
      "editorial-card",
      "flex-group",
      "accordion",
      "blockquote",
    ],
  },

  "editorial-card": {
    name: "editorial-card",
    description:
      "An editorial card is a container for a single piece of content with structured areas.",
    // Uses slots for better content organization
    allowedNamedSlots: {
      card_title: {
        description: "The card title/headline area",
        allowedChildren: ["headline"],
        required: false,
        maxItems: null, // Multiple headlines allowed as per current implementation
        minItems: 0,
      },
      card_body: {
        description: "The main content area of the card",
        allowedChildren: ["text"],
        required: false,
        maxItems: null, // Multiple text blocks allowed
        minItems: 0,
      },
      card_image: {
        description: "Media area for the card",
        allowedChildren: ["image"],
        required: false,
        maxItems: null, // Multiple images allowed
        minItems: 0,
      },
    },
  },

  header: {
    name: "header",
    description: "Header section of a page or component.",
    allowedChildren: ["headline", "text", "image"],
  },

  footer: {
    name: "footer",
    description: "Footer section of a page or component.",
    allowedChildren: ["headline", "text", "image", "list"],
  },

  // List components
  list: {
    name: "list",
    description: "A list container component.",
    allowedChildren: ["list-item"],
  },

  "list-item": {
    name: "list-item",
    description: "An individual item within a list.",
    allowedChildren: ["text", "headline"],
  },

  // Atomic/leaf components (typically no allowedChildren)
  headline: {
    name: "headline",
    description: "A headline text component.",
    allowedChildren: [], // Atomic - no allowedChildren
    props: {
      text: "string",
    },
  },

  text: {
    name: "text",
    description: "A text content component.",
    allowedChildren: [], // Atomic - no allowedChildren
    props: {
      text: "string",
    },
  },

  image: {
    name: "image",
    description: "An image component.",
    props: {
      imageUrl: "string",
    },
    allowedChildren: [], // Atomic - no allowedChildren
  },

  divider: {
    name: "divider",
    description: "A divider/separator component.",
    allowedChildren: [], // Atomic - no allowedChildren
  },

  group: {
    name: "group",
    description: "Just a placeholder for now",
    allowedChildren: [],
  },

  shape: {
    name: "shape",
    description: "A shape component.",
    allowedChildren: [], // Atomic - no allowedChildren
  },
  "flex-group": {
    name: "flex-group",
    description: "A flex group component.",
    allowedChildren: ["headline", "text", "accordion", "blockquote"],
  },

  accordion: {
    name: "accordion",
    description: "An accordion component.",
    allowedChildren: ["accordion-item"],
  },

  "accordion-item": {
    name: "accordion-item",
    description: "An accordion item component with title and content areas.",
    // Uses slots instead of allowedChildren
    allowedNamedSlots: {
      title: {
        description: "The clickable title/header of the accordion item",
        allowedChildren: ["text"],
        required: true,
        maxItems: 1, // Only one title element allowed
        minItems: 1,
      },
      content: {
        description: "The collapsible content area",
        allowedChildren: ["text", "divider", "blockquote"],
        required: true,
        maxItems: null, // Unlimited content items
        minItems: 1,
      },
    },
  },

  blockquote: {
    name: "blockquote",
    description: "A blockquote component for quotations with optional citation.",
    allowedChildren: [], // Atomic - no allowedChildren
    props: {
      content: "string",
      quote: "string",
      citation: "string",
      author: "string",
    },
  },
};
