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
import { DynamicKeyGenerator } from "./dynamic-key-generator.js";

/**
 * Initialize json-schema-faker with faker.js provider
 */
export function initializeFaker(seed?: string | number): void {
  // Static JSF initialization
  DynamicKeyGenerator.initializeJSF();

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
    // Allow deep schemas but protect against true infinite recursion
    refDepthMax: 100,
    resolveJsonPath: true,
    // Ensure properties are filled based on schema
    fillProperties: true,
  });

  logger.debug("json-schema-faker initialized");
}

/**
 * Preprocess schema to apply frequency distribution-based array lengths
 * and other field-level extensions (like _id format overrides)
 * Walks through schema and replaces minItems/maxItems with sampled values from x-array-length-distribution
 */
function preprocessSchemaExtensions(
  schema: any,
  fieldName?: string,
  depth = 0,
): any {
  // Prevent infinite recursion, but allow deep valid ones
  if (depth > 100) return schema;

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  // Clone to avoid mutating original
  let processed = { ...schema };

  // Optimization: Handle _id fields specifically to ensure they look like keys
  if (fieldName === "_id" && processed.type === "string" && !processed.format) {
    processed.format = "objectid";
    logger.debug("Applied objectid format override to _id field");
  }

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
    }  }

  // Recursively process nested properties
  if (processed.properties) {
    processed.properties = Object.fromEntries(
      Object.entries(processed.properties).map(([key, value]) => [
        key,
        preprocessSchemaExtensions(value, key, depth + 1),
      ]),
    );
  }

  // Recursively process array items
  if (processed.items) {
    if (Array.isArray(processed.items)) {
      processed.items = processed.items.map((item: any) =>
        preprocessSchemaExtensions(item, undefined, depth + 1),
      );
    } else {
      processed.items = preprocessSchemaExtensions(
        processed.items,
        undefined,
        depth + 1,
      );
    }
  }

  return processed;
}

/**
 * Generate a single document from schema
 * Optionally uses frequency distributions for more realistic array lengths
 * and expands dynamic keys
 */
export function generate(
  schema: any,
  options: {
    useFrequencyDistributions?: boolean;
    useDynamicKeys?: boolean;
    seed?: number;
    hasDynamicKeys?: boolean; // Optimization: pre-calculated
    hasDistributions?: boolean; // Optimization: pre-calculated
    dynamicKeyGenerator?: DynamicKeyGenerator; // Efficiency
  } = {},
): any {
  const {
    useFrequencyDistributions = true,
    useDynamicKeys = true,
    seed,
    hasDynamicKeys: precomputedHasDynamicKeys,
    hasDistributions: precomputedHasDistributions,
    dynamicKeyGenerator,
  } = options;

  let processedSchema = schema;

  // Step 1: Preprocess dynamic keys (must happen before array processing)
  if (useDynamicKeys) {
    // Only walk schema if we don't know for sure it has dynamic keys
    const shouldProcess =
      precomputedHasDynamicKeys !== undefined
        ? precomputedHasDynamicKeys
        : countDynamicKeySchemas(schema) > 0;

    if (shouldProcess) {
      // Use provided generator or create a transient one
      const generator = dynamicKeyGenerator || new DynamicKeyGenerator();

      // Reset generator counter for deterministic results if seed is provided
      if (seed !== undefined) {
        generator.reset();
      }

      processedSchema = preprocessDynamicKeys(
        processedSchema,
        {
          seed,
          validateKeys: true,
        },
        generator,
      );
    }
  }

  // Step 2: Preprocess schema to apply frequency distributions for arrays
  if (useFrequencyDistributions) {
    // Only walk schema if we don't know for sure it has distributions
    // or if we need to apply other field-level overrides (like _id)
    const shouldProcess =
      precomputedHasDistributions !== undefined
        ? precomputedHasDistributions
        : true; // Default to true to be safe if not precomputed

    if (shouldProcess) {
      processedSchema = preprocessSchemaExtensions(processedSchema);
    }
  }

  // Ensure faker is seeded for JSF generation if seed is provided
  if (seed !== undefined) {
    faker.seed(seed);
  }

  // Use synchronous jsf.generate for better performance (we don't use $ref)
  return jsf.generate(processedSchema);
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
  const generator = new DynamicKeyGenerator();

  for (let i = 0; i < count; i++) {
    // Yield event loop periodically to prevent starvation
    if (i > 0 && i % 100 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Use seed + i for deterministic but varied generation
    const docSeed = options.seed !== undefined ? options.seed + i : undefined;
    const doc = generate(schema, {
      ...options,
      seed: docSeed,
      dynamicKeyGenerator: generator,
    });
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
