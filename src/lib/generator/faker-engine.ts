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
 * Precompute which branches of the schema have extensions that need per-document processing
 */
const HAS_EXTENSIONS = Symbol("has_extensions");

/**
 * Perform one-time preparation of the schema for faster generation
 */
export function prepareSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  let hasExtensions = false;

  // 1. One-time _id format override
  if (
    schema.properties?._id &&
    schema.properties._id.type === "string" &&
    !schema.properties._id.format
  ) {
    schema.properties._id.format = "objectid";
    logger.debug("Applied one-time objectid format override to _id field");
  }

  // 2. Prune "undefined" types - these are non-standard and cause massive performance issues
  // in json-schema-faker when objects have thousands of them.
  if (schema.properties) {
    const propertyEntries = Object.entries(schema.properties);
    const initialCount = propertyEntries.length;
    const prunedProperties: string[] = [];

    for (const [key, value] of propertyEntries) {
      if ((value as any).type === "undefined") {
        delete schema.properties[key];
        prunedProperties.push(key);
      }
    }

    if (prunedProperties.length > 0) {
      hasExtensions = true; // Mark as modified
      logger.warn(
        `Pruned ${prunedProperties.length}/${initialCount} properties with type "undefined"`,
        {
          path: schema.title || "anonymous object",
        },
      );

      // Also remove from required array if present
      if (Array.isArray(schema.required)) {
        schema.required = schema.required.filter(
          (req: string) => !prunedProperties.includes(req),
        );
      }
    }
  }

  // 3. Check for distributions/extensions at current level
  if (
    schema["x-array-length-distribution"] ||
    schema["x-gen"]?.enum?.distribution ||
    schema["x-dynamic-keys"]
  ) {
    hasExtensions = true;
  }

  // 4. Recursively prepare nested properties
  if (schema.properties) {
    for (const value of Object.values(schema.properties)) {
      const preparedChild = prepareSchema(value);
      if (preparedChild[HAS_EXTENSIONS]) {
        hasExtensions = true;
      }
    }
  }

  // 5. Recursively prepare array items
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      for (const item of schema.items) {
        if (prepareSchema(item)[HAS_EXTENSIONS]) {
          hasExtensions = true;
        }
      }
    } else {
      if (prepareSchema(schema.items)[HAS_EXTENSIONS]) {
        hasExtensions = true;
      }
    }
  }

  // Mark the schema with the precomputed flag
  try {
    Object.defineProperty(schema, HAS_EXTENSIONS, {
      value: hasExtensions,
      enumerable: false,
      configurable: true,
    });
  } catch (e) {
    // Fallback if object is not extensible
  }

  return schema;
}

/**
 * Preprocess schema to apply frequency distribution-based array lengths
 * and other field-level extensions
 * Walks through schema and replaces minItems/maxItems with sampled values
 */
function preprocessSchemaExtensions(schema: any, depth = 0): any {
  // Prevent infinite recursion
  if (depth > 100) return schema;

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  // OPTIMIZATION: If this branch has no extensions, return it as-is (no cloning!)
  if (schema[HAS_EXTENSIONS] === false) {
    return schema;
  }

  // Clone only when we might mutate
  let processed = { ...schema };
  let modified = false;

  // Check if this is an array with x-array-length-distribution annotation
  if (
    processed.type === "array" &&
    processed["x-array-length-distribution"]?.distribution
  ) {
    const distribution = processed["x-array-length-distribution"]
      .distribution as FrequencyDistribution;

    try {
      const sampledLength = Number(sampleFromDistribution(distribution));
      processed.minItems = sampledLength;
      processed.maxItems = sampledLength;
      modified = true;

      logger.debug("Applied frequency distribution sampling for array", {
        sampledLength,
      });
    } catch (error) {
      logger.warn("Failed to sample from array length distribution", { error });
    }
  }

  // Check if this field has x-gen.enum extension
  if (processed["x-gen"]?.enum?.distribution) {
    const distribution = processed["x-gen"].enum
      .distribution as FrequencyDistribution;
    try {
      const sampledValue = sampleFromDistribution(distribution);
      let finalValue: string | number = sampledValue;

      if (processed.type === "number" || processed.type === "integer") {
        const num = Number(sampledValue);
        if (!isNaN(num)) finalValue = num;
      }

      processed.enum = [finalValue];
      modified = true;
    } catch (error) {
      logger.warn("Failed to sample from enum distribution", { error });
    }
  }

  // Recursively process nested properties only if they might have extensions
  if (processed.properties) {
    const newProps: any = {};
    let propsChanged = false;

    for (const [key, value] of Object.entries(processed.properties)) {
      const newVal = preprocessSchemaExtensions(value, depth + 1);
      newProps[key] = newVal;
      if (newVal !== value) propsChanged = true;
    }

    if (propsChanged) {
      processed.properties = newProps;
      modified = true;
    }
  }

  // Recursively process array items
  if (processed.items) {
    if (Array.isArray(processed.items)) {
      const newItems = processed.items.map((item: any) =>
        preprocessSchemaExtensions(item, depth + 1),
      );
      const itemsChanged = newItems.some(
        (item: any, i: number) => item !== (processed.items as any)[i],
      );
      if (itemsChanged) {
        processed.items = newItems;
        modified = true;
      }
    } else {
      const newItem = preprocessSchemaExtensions(processed.items, depth + 1);
      if (newItem !== processed.items) {
        processed.items = newItem;
        modified = true;
      }
    }
  }

  return modified ? processed : schema;
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
