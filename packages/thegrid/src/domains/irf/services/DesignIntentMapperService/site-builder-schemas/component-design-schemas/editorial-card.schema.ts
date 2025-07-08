import { z } from "@hono/zod-openapi";
import {
  colorPickerFieldSchema,
  spacingFieldSchema,
  toggleFieldSchema,
} from "../field-schemas";
import { sitebuilderDesignSchema } from "../site-builder-field-schema";

// Fields specific to sb-editorial-card
export const editorialCardFieldsSchema = z.object({
  spacing: spacingFieldSchema.optional(),
  text_color: colorPickerFieldSchema.optional(),
  visibility: toggleFieldSchema.optional(),
});

// The complete design schema for the sb-editorial-card component
export const sbEditorialCardDesignSchema = sitebuilderDesignSchema.extend({
  fields: editorialCardFieldsSchema,
});

export type SbEditorialCardDesign = z.infer<typeof sbEditorialCardDesignSchema>;
