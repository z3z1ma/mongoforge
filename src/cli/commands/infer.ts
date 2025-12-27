/**
 * Infer command - discover schema from MongoDB collection
 */

import { Command } from "commander";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { InferCommandOptions, InferConfig } from "../config/types.js";
import { parseConfigFile, validateConfigSection } from "../config/parser.js";
import { Sampler } from "../../lib/sampler/index.js";
import { Normalizer } from "../../lib/normalizer/index.js";
import { Inferencer } from "../../lib/inferencer/index.js";
import { Profiler } from "../../lib/profiler/index.js";
import { Synthesizer } from "../../lib/synthesizer/index.js";
import {
  GenerationSchema,
  ConstraintsProfile,
  TypeHint,
} from "../../types/data-model.js";
import { logger } from "../../utils/logger.js";
import { loadDynamicKeyConfig } from "../../utils/config-loader.js";
import { MongoForgeError, ErrorCode, ConfigError } from "../../utils/errors.js";

/**
 * Merge CLI options with config file
 */
function mergeInferConfig(
  options: InferCommandOptions,
  configFile?: InferConfig,
): InferConfig {
  // Parse comma-separated values
  const percentiles = options.percentiles
    ? options.percentiles.split(",").map((p) => parseInt(p.trim(), 10))
    : undefined;

  const clampRange = options.clampRange
    ? (options.clampRange.split(",").map((p) => parseInt(p.trim(), 10)) as [
        number,
        number,
      ])
    : undefined;

  const keyFields = options.keyFields
    ? options.keyFields.split(",").map((k) => k.trim())
    : undefined;

  // Build config from CLI options
  const cliConfig: Partial<InferConfig> = {
    source: options.sourceUri
      ? {
          uri: options.sourceUri,
          database: options.sourceDb!,
          collection: options.sourceCollection!,
        }
      : undefined,
    sampling: options.sampleSize
      ? {
          sampleSize: options.sampleSize,
          strategy: options.samplingStrategy || "random",
          timeField: options.timeField,
        }
      : undefined,
    constraints: options.arrayLenPolicy
      ? {
          arrayLenPolicy: options.arrayLenPolicy,
          percentiles: percentiles || [50, 90, 99],
          clampRange: clampRange || [1, 99],
          sizeProxy: "leafFieldCount",
        }
      : undefined,
    keys: options.idPolicy
      ? {
          idPolicy: options.idPolicy,
          keyFields: keyFields || [],
          enforceUniqueKeys: options.enforceUniqueKeys ?? false,
          uniquenessScope: options.uniquenessScope || "run",
        }
      : undefined,
    synthesis:
      options.enforceRequired !== undefined ||
      options.requiredThreshold !== undefined
        ? {
            enforceRequired: options.enforceRequired ?? true,
            requiredThreshold: options.requiredThreshold ?? 0.95,
          }
        : undefined,
    output: options.outputDir
      ? {
          dir: options.outputDir,
        }
      : undefined,
  };

  // Merge with config file (CLI options take precedence)
  const merged: InferConfig = {
    source: { ...configFile?.source, ...cliConfig.source } as any,
    sampling: { ...configFile?.sampling, ...cliConfig.sampling } as any,
    constraints: {
      ...configFile?.constraints,
      ...cliConfig.constraints,
    } as any,
    keys: { ...configFile?.keys, ...cliConfig.keys } as any,
    synthesis: {
      ...configFile?.synthesis,
      ...cliConfig.synthesis,
    } as any,
    output: { ...configFile?.output, ...cliConfig.output } as any,
  };

  return merged;
}

/**
 * Validate infer configuration
 */
function validateInferConfig(config: InferConfig): void {
  // Validate source
  if (
    !config.source?.uri ||
    !config.source?.database ||
    !config.source?.collection
  ) {
    throw new Error(
      "Missing required source configuration: --source-uri, --source-db, --source-collection",
    );
  }

  // Validate sampling
  if (!config.sampling?.sampleSize) {
    throw new Error("Missing required sampling configuration: --sample-size");
  }

  if (
    config.sampling.strategy === "time-windowed" &&
    !config.sampling.timeField
  ) {
    throw new Error(
      "--time-field is required when using time-windowed sampling strategy",
    );
  }

  // Set defaults if missing
  config.output = config.output || { dir: "./output" };
  config.constraints = config.constraints || {
    arrayLenPolicy: "percentileClamp",
    percentiles: [50, 90, 99],
    clampRange: [1, 99],
    sizeProxy: "leafFieldCount",
  };
  config.keys = config.keys || {
    idPolicy: "inferred",
    keyFields: [],
    enforceUniqueKeys: false,
    uniquenessScope: "run",
  };
  config.synthesis = config.synthesis || {
    enforceRequired: true,
    requiredThreshold: 0.95,
  };
}

/**
 * Step 1: Sample documents from MongoDB
 */
async function sampleFromMongo(config: InferConfig): Promise<any[]> {
  logger.info("Sampling documents from MongoDB");

  // Map CLI strategy to sampler strategy
  const samplingStrategy =
    config.sampling.strategy === "first-n"
      ? ("firstN" as const)
      : config.sampling.strategy === "time-windowed"
        ? ("timeWindowed" as const)
        : ("random" as const);

  const samplerOptions = {
    uri: config.source.uri,
    database: config.source.database,
    collection: config.source.collection,
    sampleSize: config.sampling.sampleSize,
    strategy: samplingStrategy,
    timeWindow: config.sampling.timeField
      ? {
          field: config.sampling.timeField,
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
          end: new Date(),
        }
      : undefined,
  };

  const sampler = new Sampler(samplerOptions);
  const samplerResult = await sampler.sample(samplerOptions);

  logger.info("Sampling complete", { count: samplerResult.documents.length });
  return samplerResult.documents;
}

/**
 * Step 2: Normalize documents
 */
function normalizeDocuments(samples: any[]): {
  normalized: any[];
  typeHints: Map<string, TypeHint>;
} {
  logger.info("Normalizing documents");
  const normalizer = new Normalizer();
  const { documents: normalized, typeHints } = normalizer.normalize(samples);

  logger.info("Normalization complete", {
    count: normalized.length,
    uniqueTypeHints: typeHints.size,
  });

  return { normalized, typeHints };
}

/**
 * Step 3: Infer schema with dynamic key detection
 */
async function performSchemaInference(
  normalized: any[],
  dynamicKeyConfig: any,
): Promise<any> {
  logger.info("Inferring schema");
  const inferencer = new Inferencer({
    semanticTypes: true,
    storeValues: true,
    dynamicKeyDetection: dynamicKeyConfig,
  });

  const result = await inferencer.infer(normalized);

  logger.info("Schema inference complete", {
    ...result.metadata,
    dynamicKeysDetected: result.metadata.dynamicKeysDetected || 0,
  });

  return result;
}

/**
 * Step 4: Profile constraints and handle dynamic key stripping
 */
function profileConstraints(
  normalized: any[],
  config: InferConfig,
  dynamicKeyAnalyses?: Map<string, any>,
): any {
  logger.info("Profiling constraints");
  const profiler = new Profiler({
    arrayLenPolicy: config.constraints.arrayLenPolicy,
    percentiles: config.constraints.percentiles,
    clampRange: config.constraints.clampRange,
    sizeProxy: config.constraints.sizeProxy,
  });

  const { profile: constraints, metadata } = profiler.profile(normalized);

  // Strip array stats for paths nested under dynamic key fields to prevent bloat
  if (dynamicKeyAnalyses && dynamicKeyAnalyses.size > 0) {
    const dynamicKeyPaths = new Set(
      Array.from(dynamicKeyAnalyses.entries())
        .filter(([_, analysis]) => analysis.isDynamic)
        .map(([path, _]) => path),
    );

    let removedCount = 0;
    for (const [arrayPath, _] of constraints.arrayStats) {
      for (const dynamicPath of dynamicKeyPaths) {
        if (arrayPath.startsWith(dynamicPath + ".")) {
          constraints.arrayStats.delete(arrayPath);
          removedCount++;
          break;
        }
      }
    }

    if (removedCount > 0) {
      logger.info("Stripped array stats nested under dynamic key fields", {
        removedEntries: removedCount,
        remainingEntries: constraints.arrayStats.size,
      });
    }
  }

  // Apply additional key field configuration
  for (const keyField of config.keys.keyFields) {
    constraints.keyFields.additionalKeys.push({
      fieldPath: keyField,
      type: "string",
      enforceUniqueness: config.keys.enforceUniqueKeys,
      uniquenessScope: config.keys.uniquenessScope,
    });
  }

  logger.info("Profiling complete", metadata);
  return { constraints, metadata };
}

/**
 * Step 5: Synthesize generation schema
 */
function synthesizeGenerationSchema(
  inferredSchema: any,
  constraints: any,
  typeHints: Map<string, TypeHint>,
  config: InferConfig,
  dynamicKeyAnalyses?: Map<string, any>,
): any {
  logger.info("Synthesizing generation schema");
  const synthesizer = new Synthesizer({
    enforceRequired: config.synthesis.enforceRequired,
    requiredThreshold: config.synthesis.requiredThreshold,
    includeMetadata: true,
  });

  const result = synthesizer.synthesize(
    inferredSchema,
    constraints,
    typeHints,
    dynamicKeyAnalyses,
  );

  logger.info("Generation schema synthesized", result.metadata);
  return result;
}

/**
 * Helper to write JSON artifact to disk
 */
function writeJsonArtifact(path: string, data: any): void {
  // Handle Map and other non-JSON objects
  const serializable = JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    }),
  );

  writeFileSync(path, JSON.stringify(serializable, null, 2), "utf-8");
}

/**
 * Execute infer command
 */
async function executeInfer(options: InferCommandOptions): Promise<void> {
  const startTime = Date.now();

  try {
    // Set log level if provided
    if (options.logLevel) {
      logger.setLevel(options.logLevel as any);
    }

    // Parse config file if provided
    let configFile: InferConfig | undefined;
    if (options.config) {
      const fullConfig = parseConfigFile(options.config);
      configFile = fullConfig.infer as InferConfig;
    }

    // Merge and validate configurations
    const config = mergeInferConfig(options, configFile);
    validateInferConfig(config);

    logger.info("Starting discovery phase", { config });

    // Create output directory
    mkdirSync(config.output.dir, { recursive: true });

    // Step 1: Sampling
    const samples = await sampleFromMongo(config);
    if (samples.length === 0) {
      throw new Error("No documents found in the source collection");
    }

    // Step 2: Normalization
    const { normalized, typeHints } = normalizeDocuments(samples);

    // Step 3: Schema Inference
    const dynamicKeyCliOptions = {
      dynamicKeyThreshold: options.dynamicKeyThreshold,
      noDynamicKeys: options.noDynamicKeys,
    };
    const dynamicKeyConfigSection = configFile
      ? (configFile as any).dynamicKeys
      : undefined;
    const dynamicKeyConfig = loadDynamicKeyConfig(
      dynamicKeyCliOptions,
      dynamicKeyConfigSection,
    );

    const {
      schema: inferredSchema,
      metadata: inferMeta,
      dynamicKeyAnalyses,
    } = await performSchemaInference(normalized, dynamicKeyConfig);

    const inferredSchemaPath = resolve(
      config.output.dir,
      "inferred.schema.json",
    );
    writeJsonArtifact(inferredSchemaPath, inferredSchema);

    // Step 4: Constraints Profiling
    const { constraints, metadata: profileMeta } = profileConstraints(
      normalized,
      config,
      dynamicKeyAnalyses,
    );

    const constraintsPath = resolve(config.output.dir, "constraints.json");
    writeJsonArtifact(constraintsPath, constraints);

    // Step 5: Synthesis
    const { schema: generationSchema, metadata: synthMeta } =
      synthesizeGenerationSchema(
        inferredSchema,
        constraints,
        typeHints,
        config,
        dynamicKeyAnalyses,
      );

    const generationSchemaPath = resolve(
      config.output.dir,
      "generation.schema.json",
    );
    writeJsonArtifact(generationSchemaPath, generationSchema);

    const duration = Date.now() - startTime;

    // Output success result
    const result = {
      status: "success",
      phase: "discovery",
      artifacts: {
        inferredSchema: inferredSchemaPath,
        generationSchema: generationSchemaPath,
        constraints: constraintsPath,
      },
      summary: {
        sampledDocuments: samples.length,
        fieldsInferred: inferMeta.fieldsDiscovered,
        arrayPathsTracked: profileMeta.arrayFieldsFound,
        dynamicKeysDetected: inferMeta.dynamicKeysDetected || 0,
        durationMs: duration,
      },
    };

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    let forgeError: MongoForgeError;

    if (error instanceof MongoForgeError) {
      forgeError = error;
    } else {
      const isMongo =
        error instanceof Error && error.message.includes("MongoDB");
      forgeError = new MongoForgeError(
        isMongo ? ErrorCode.MONGO_CONNECTION_ERROR : ErrorCode.GENERAL_ERROR,
        error instanceof Error ? error.message : String(error),
        undefined,
        { cause: error },
      );
    }

    const errorResponse = forgeError.toResponse("discovery");
    console.error(JSON.stringify(errorResponse, null, 2));

    // Determine exit code
    let exitCode = 1;
    if (forgeError.code === ErrorCode.CONFIG_ERROR) exitCode = 2;

    process.exit(exitCode);
  }
}

/**
 * Create infer command
 */
export function createInferCommand(): Command {
  const command = new Command("infer");

  command
    .description(
      "Sample MongoDB collection, infer schema with dynamic key detection, and produce discovery artifacts",
    )
    .option("--source-uri <uri>", "MongoDB connection URI")
    .option("--source-db <database>", "Source database name")
    .option("--source-collection <collection>", "Source collection name")
    .option("--sample-size <count>", "Number of documents to sample", (val) =>
      parseInt(val, 10),
    )
    .option(
      "--sampling-strategy <strategy>",
      "Sampling strategy: random, first-n, time-windowed",
      "random",
    )
    .option("--time-field <field>", "Field for time-windowed sampling")
    .option("--output-dir <path>", "Directory for output artifacts", "./output")
    .option(
      "--array-len-policy <policy>",
      "Array length policy: minmax, percentileClamp",
      "percentileClamp",
    )
    .option(
      "--percentiles <values>",
      "Percentiles to track (comma-separated)",
      "50,90,99",
    )
    .option(
      "--clamp-range <range>",
      "Percentile clamping range [low,high]",
      "1,99",
    )
    .option(
      "--id-policy <policy>",
      "ID policy: objectid, uuid, string, number, inferred",
      "inferred",
    )
    .option(
      "--key-fields <fields>",
      "Additional key fields (comma-separated)",
      "",
    )
    .option("--enforce-unique-keys", "Enforce uniqueness for key fields", false)
    .option("--uniqueness-scope <scope>", "Uniqueness scope: batch, run", "run")
    .option(
      "--required-threshold <number>",
      "Probability threshold for required fields (default: 0.95)",
      (val) => parseFloat(val),
    )
    .option(
      "--no-enforce-required",
      "Disable enforcing required fields based on probability",
    )
    .option(
      "--dynamic-key-threshold <number>",
      "Minimum unique keys to trigger dynamic key detection (default: 50)",
      (val) => parseInt(val, 10),
    )
    .option(
      "--no-dynamic-keys",
      "Disable dynamic key detection and inference for objects with highly variable keys",
    )
    .option("--config <path>", "Path to configuration file (JSON/YAML)")
    .option(
      "--log-level <level>",
      "Logging verbosity: error, warn, info, debug",
      "info",
    )
    .action(executeInfer);

  return command;
}
