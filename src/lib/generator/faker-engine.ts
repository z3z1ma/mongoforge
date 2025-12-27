/**
 * json-schema-faker initialization with @faker-js/faker provider
 * Updated to support frequency distribution-based array length sampling (Feature: 002-dynamic-key-inference)
 */

import jsf from "json-schema-faker";
import { faker } from "@faker-js/faker";
import { logger } from "../../utils/logger.js";
import { hashStringToSeed } from "../../utils/seed-manager.js";
import { sampleFromDistribution } from "../../utils/frequency-map.js";
import type { FrequencyDistribution } from "../../types/dynamic-keys.js";
import {
  preprocessSchema as preprocessDynamicKeys,
  countDynamicKeySchemas,
} from "./schema-preprocessor.js";

// Polyfill for json-schema-faker's browser-specific code in Node.js
// jsf tries to access location.href which doesn't exist in Node.js
if (typeof (globalThis as any).location === "undefined") {
  (globalThis as any).location = { href: "" };
}

/**
 * Initialize json-schema-faker with faker.js provider
 */
export function initializeFaker(seed?: string | number): void {
  // Configure jsf to use faker
  jsf.extend("faker", () => faker);

  // Set seed if provided
  if (seed !== undefined) {
    const numericSeed =
      typeof seed === "string" ? hashStringToSeed(seed) : seed;
    faker.seed(numericSeed);
    logger.debug("Faker seed set", { seed, numericSeed });
  }

  // Configure jsf options
  jsf.option({
    alwaysFakeOptionals: true,
    useDefaultValue: false,
    useExamplesValue: false,
    failOnInvalidTypes: false,
    failOnInvalidFormat: false,
    maxItems: 10,
    maxLength: 100,
    random: () => faker.number.float({ min: 0, max: 1 }),
  });

  logger.debug("json-schema-faker initialized");
}

/**
 * Preprocess schema to apply frequency distribution-based array lengths
 * Walks through schema and replaces minItems/maxItems with sampled values from x-array-length-distribution
 */
function preprocessSchemaForArrays(schema: any): any {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  // Clone to avoid mutating original
  const processed = { ...schema };

  // Check if this is an array with x-array-length-distribution annotation
  if (
    processed.type === "array" &&
    processed["x-array-length-distribution"]?.distribution
  ) {
    const distribution = processed["x-array-length-distribution"]
      .distribution as FrequencyDistribution;

    try {
      // Sample a length from the distribution
      const sampledLength = sampleFromDistribution(distribution);

      // Override minItems/maxItems to force this specific length
      processed.minItems = sampledLength;
      processed.maxItems = sampledLength;

      logger.debug("Applied frequency distribution sampling for array", {
        sampledLength,
        distributionSize: Object.keys(distribution).length,
      });
    } catch (error) {
      logger.warn(
        "Failed to sample from array length distribution, using existing constraints",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  // Recursively process nested properties
  if (processed.properties) {
    processed.properties = Object.fromEntries(
      Object.entries(processed.properties).map(([key, value]) => [
        key,
        preprocessSchemaForArrays(value),
      ]),
    );
  }

  // Recursively process array items
  if (processed.items) {
    if (Array.isArray(processed.items)) {
      processed.items = processed.items.map((item: any) =>
        preprocessSchemaForArrays(item),
      );
    } else {
      processed.items = preprocessSchemaForArrays(processed.items);
    }
  }

  return processed;
}

/**
 * Generate a single document from schema
 * Optionally uses frequency distributions for more realistic array lengths
 * and expands dynamic keys
 */
export async function generate(
  schema: any,
  options: {
    useFrequencyDistributions?: boolean;
    useDynamicKeys?: boolean;
    seed?: number;
  } = {},
): Promise<any> {
  const {
    useFrequencyDistributions = true,
    useDynamicKeys = true,
    seed,
  } = options;

  let processedSchema = schema;

  // Step 1: Preprocess dynamic keys (must happen before array processing)
  if (useDynamicKeys) {
    const dynamicKeyCount = countDynamicKeySchemas(schema);
    if (dynamicKeyCount > 0) {
      logger.debug("Preprocessing dynamic keys", { count: dynamicKeyCount });
      processedSchema = preprocessDynamicKeys(processedSchema, {
        seed,
        validateKeys: true,
      });
    }
  }

  // Step 2: Preprocess schema to apply frequency distributions for arrays
  if (useFrequencyDistributions) {
    processedSchema = preprocessSchemaForArrays(processedSchema);
  }

  return jsf.resolve(processedSchema);
}

/**
 * Generate multiple documents from schema
 * Optionally uses frequency distributions for more realistic array lengths
 * and expands dynamic keys
 */
export async function generateMany(
  schema: any,
  count: number,
  options: {
    useFrequencyDistributions?: boolean;
    useDynamicKeys?: boolean;
    seed?: number;
  } = {},
): Promise<any[]> {
  const documents: any[] = [];

  for (let i = 0; i < count; i++) {
    // Use seed + i for deterministic but varied generation
    const docSeed = options.seed !== undefined ? options.seed + i : undefined;
    const doc = await generate(schema, { ...options, seed: docSeed });
    documents.push(doc);
  }

  return documents;
}

/**
 * Reset faker to new seed
 */
export function resetSeed(seed?: string | number): void {
  if (seed !== undefined) {
    const numericSeed =
      typeof seed === "string" ? hashStringToSeed(seed) : seed;
    faker.seed(numericSeed);
    logger.debug("Faker seed reset", { seed, numericSeed });
  }
}
