import { config } from "../../../config.env";
import FirecrawlApp from "@mendable/firecrawl-js";
import { z, ZodObject } from "zod";

const createFirecrawlService = () => {
  const firecrawl = new FirecrawlApp({ apiKey: config.FIRECRAWL_API_KEY });

  const exampleSchema = z.object({
    company_mission: z.string(),
    supports_sso: z.boolean(),
    is_open_source: z.boolean(),
    is_in_yc: z.boolean(),
  });

  const scrapeWebsite = async ({ url }: { url: string }) => {
    const result = await firecrawl.scrapeUrl(url);

    if (result.success) {
      return result.markdown as string;
    } else {
      return result.error;
    }
  };

  const crawlWebsite = async ({
    url,
    config,
  }: {
    url: string;
    config: { excludePaths: string[]; limit: number };
  }) => {
    const result = await firecrawl.crawlUrl(url, config);

    return result;
  };

  // beta
  const extractFromWebsite = async ({
    prompt = "Extract the data provided in the schema",
    urls = [
      "https://docs.firecrawl.dev/*",
      "https://firecrawl.dev/",
      "https://www.ycombinator.com/companies/",
    ],
    zodSchema = exampleSchema,
  }: {
    prompt?: string;
    urls?: string[];
    zodSchema?: ZodObject<any, any, any, any, any>;
  }) => {
    const result = await firecrawl.extract(urls, {
      prompt,
      schema: zodSchema,
    });

    return result;
  };

  // Return public interface
  return {
    firecrawl,
    crawlWebsite,
    scrapeWebsite,
    extractFromWebsite,
  };
};

export { createFirecrawlService };
export const firecrawlService = createFirecrawlService();
