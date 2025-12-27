import { Command } from "commander";
import { Readable, pipeline } from "stream";
import { promisify } from "util";
import { createWriteStream } from "fs";
import { createMongoInserter } from "../../lib/emitter/mongo-inserter.js";
import { createNDJSONWriter } from "../../lib/emitter/ndjson-writer.js";
import { createJSONWriter } from "../../lib/emitter/json-writer.js";
import { createGeneratorStream } from "../../lib/generator/stream.js";
import { loadGenerationSchema } from "../../lib/generator/schema-loader.js";
import { createCDCStream } from "../../lib/generator/cdc-stream.js";
import { DocumentIDCache } from "../../lib/utils/id-cache.js";
import { logger } from "../../utils/logger.js";
import { MutationConfig } from "../../types/cdc.js";

import { parseConfigFile } from "../config/parser.js";
import { GenerateCommandOptions, GenerateConfig } from "../config/types.js";

const pipelineAsync = promisify(pipeline);

/**
 * Merge CLI options with config file
 */
function mergeGenerateConfig(
  options: GenerateCommandOptions,
  configFile?: GenerateConfig,
): GenerateConfig {
  // Build config from CLI options
  const cliConfig: Partial<GenerateConfig> = {
    generationSchema: options.generationSchema,
    constraints: options.constraints,
    docCount: options.docCount,
    seed: options.seed,
    output:
      options.outputFormat || options.outputPath
        ? {
            format: (options.outputFormat as any) || "ndjson",
            path: options.outputPath || "stdout",
            splitFilesBy: options.splitFilesBy,
            splitSize: options.splitSize,
          }
        : undefined,
    target: options.targetUri
      ? {
          uri: options.targetUri,
          database: options.targetDb!,
          collection: options.targetCollection!,
          collectionSuffix: options.collectionSuffix,
          batchSize: options.batchSize || 1000,
          writeConcern: options.writeConcern || "majority",
          orderedInserts: options.orderedInserts ?? false,
        }
      : undefined,
    customGenerators: options.customGenerators,
  };

  // Merge with config file (CLI options take precedence)
  const merged: GenerateConfig = {
    ...configFile,
    ...Object.fromEntries(
      Object.entries(cliConfig).filter(
        ([_, v]) => v !== undefined && _ !== "output" && _ !== "target",
      ),
    ),
    output: {
      format: "ndjson",
      path: "stdout",
      ...configFile?.output,
      ...cliConfig.output,
    } as any,
    target: (cliConfig.target || configFile?.target
      ? { ...configFile?.target, ...cliConfig.target }
      : undefined) as any,
  } as GenerateConfig;

  // Set defaults for required fields if missing after merge
  merged.generationSchema =
    merged.generationSchema || "./schemas/generation.schema.json";
  merged.constraints = merged.constraints || "./schemas/constraints.json";
  merged.docCount = merged.docCount || 10000;

  return merged;
}

/**
 * Create generate command with MongoDB insertion mode
 * @returns Commander Command
 */
export function createGenerateCommand(): Command {
  return new Command("generate")
    .description(
      "Generate synthetic documents with support for dynamic key patterns",
    )
    .option("--generation-schema <path>", "Path to generation schema file")
    .option("--constraints <path>", "Path to constraints file")
    .option("--doc-count <number>", "Number of documents to generate", (val) =>
      parseInt(val, 10),
    )
    .option("--seed <seed>", "Seed for deterministic generation")
    .option("--output-path <path>", 'Output path (or "stdout")')
    .option(
      "--output-format <format>",
      "Output format: ndjson, json, mongo-cdc",
    )
    .option("--target-uri <uri>", "MongoDB URI for direct insertion")
    .option("--target-db <database>", "Target database name")
    .option("--target-collection <collection>", "Target collection name")
    .option("--collection-suffix <suffix>", "Suffix for target collection")
    .option(
      "--batch-size <number>",
      "Batch size for MongoDB bulk inserts",
      (val) => parseInt(val, 10),
    )
    .option("--write-concern <concern>", "Write concern for MongoDB inserts")
    .option("--ordered-inserts", "Use ordered bulk inserts", false)
    .option(
      "--operation-ratios <ratios>",
      "Operation ratios for CDC mode (e.g., insert:50,update:40,delete:10)",
      "insert:100",
    )
    .option(
      "--id-cache-size <size>",
      "Max IDs to track in memory for CDC mode",
      "10000",
    )
    .option(
      "--warmup-inserts <number>",
      "Number of initial inserts to populate ID cache",
      "0",
    )
    .option("--rate-limit <ops>", "Rate limit for CDC mode (ops/sec)", "0")
    .option(
      "--dynamic-key-threshold <number>",
      "Minimum unique keys for dynamic key generation (default: 50)",
      (val) => parseInt(val, 10),
    )
    .option(
      "--no-dynamic-keys",
      "Disable dynamic key generation for objects with variable key patterns",
    )
    .option("--config <path>", "Path to configuration file (JSON/YAML)")
    .action(async (opts) => {
      try {
        // Parse config file if provided
        let configFile: GenerateConfig | undefined;
        if (opts.config) {
          const fullConfig = parseConfigFile(opts.config);
          configFile = fullConfig.generate as GenerateConfig;
        }

        // Merge and validate configurations
        const config = mergeGenerateConfig(opts, configFile);

        const docCount = config.docCount;
        const batchSize = config.target?.batchSize || 1000;

        // Load generation schema
        const schema = await loadGenerationSchema(
          config.generationSchema,
          config.constraints,
        );

        let insertionMetrics = null;

        // CDC Simulation Mode
        if (
          config.output.format === ("mongo-cdc" as any) ||
          opts.outputFormat === "mongo-cdc"
        ) {
          const target = config.target;
          if (!target?.uri || !target?.database || !target?.collection) {
            throw new Error(
              "--target-uri, --target-db, and --target-collection are required for mongo-cdc mode",
            );
          }

          const cacheSize = parseInt(opts.idCacheSize);
          const cache = new DocumentIDCache(cacheSize);
          const ratios = parseRatios(opts.operationRatios);
          const mutationConfig: MutationConfig = {
            targetUri: target.uri,
            database: target.database,
            collection: target.collection,
            ratios,
            rateLimit: parseInt(opts.rateLimit),
            batchSize: batchSize,
            updateStrategy: "partial",
            deleteBehavior: "remove",
            idCacheSize: cacheSize,
          };

          const inserter = await createMongoInserter({
            uri: target.uri,
            database: target.database,
            collection: target.collection,
            collectionSuffix: target.collectionSuffix,
            batchSize: batchSize,
            writeConcern: target.writeConcern,
            orderedInserts: target.orderedInserts,
          });

          // Warmup phase
          const warmupCount = parseInt(opts.warmupInserts);
          if (warmupCount > 0) {
            logger.info(`Running warmup phase: ${warmupCount} inserts`);

            // We need to capture IDs from warmup stream.
            const warmupConfig: MutationConfig = {
              ...mutationConfig,
              ratios: { insert: 100, update: 0, delete: 0 },
            };
            const warmupCDCStream = createCDCStream(
              schema,
              warmupConfig,
              cache,
              warmupCount,
            );
            await inserter.bulkWrite(warmupCDCStream);
            logger.info(`Warmup complete. Cache size: ${cache.size()}`);
          }

          const cdcStream = createCDCStream(
            schema,
            mutationConfig,
            cache,
            docCount,
          );
          const cdcInserter = await createMongoInserter({
            uri: target.uri,
            database: target.database,
            collection: target.collection,
            collectionSuffix: target.collectionSuffix,
            batchSize: batchSize,
            writeConcern: target.writeConcern,
            orderedInserts: target.orderedInserts,
          });

          insertionMetrics = await cdcInserter.bulkWrite(cdcStream);
        }
        // MongoDB Direct Insertion Mode
        else if (
          config.target?.uri &&
          config.target?.database &&
          config.target?.collection
        ) {
          const documentStream = createGeneratorStream(
            schema,
            docCount,
            batchSize,
            config.seed,
          );
          const inserter = await createMongoInserter({
            uri: config.target.uri,
            database: config.target.database,
            collection: config.target.collection,
            collectionSuffix: config.target.collectionSuffix,
            batchSize: batchSize,
            writeConcern: config.target.writeConcern,
            orderedInserts: config.target.orderedInserts,
          });

          insertionMetrics = await inserter.bulkInsert(documentStream);
        }
        // File/Stdout Output Mode
        else {
          const documentStream = createGeneratorStream(
            schema,
            docCount,
            batchSize,
            config.seed,
          );
          const outputStream =
            config.output.path === "stdout"
              ? process.stdout
              : createWriteStream(config.output.path);

          // Create format writer based on output format option
          const formatWriter =
            config.output.format === "json"
              ? createJSONWriter()
              : createNDJSONWriter();

          await pipelineAsync(documentStream, formatWriter, outputStream);
        }

        // Prepare and output result
        const result = {
          status: "success",
          phase: "generation",
          output: {
            totalDocuments: docCount,
            ...(insertionMetrics
              ? {
                  destination:
                    config.target!.uri +
                    "/" +
                    config.target!.database +
                    "/" +
                    config.target!.collection +
                    (config.target!.collectionSuffix || ""),
                  insertedDocuments: insertionMetrics.insertedDocuments,
                  updatedDocuments: insertionMetrics.updatedDocuments,
                  deletedDocuments: insertionMetrics.deletedDocuments,
                  failedInserts: insertionMetrics.failedInserts,
                }
              : {
                  format: config.output.format,
                  path: config.output.path,
                }),
          },
          metrics: insertionMetrics
            ? {
                durationMs: insertionMetrics.durationMs,
                throughput: Math.round(
                  docCount / (insertionMetrics.durationMs / 1000),
                ),
                memoryPeakMb: process.memoryUsage().heapUsed / 1024 / 1024,
              }
            : null,
        };

        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      } catch (error) {
        logger.error("Generate command error", error);
        process.exit(1);
      }
    });
}

function parseRatios(ratioStr: string) {
  const ratios = { insert: 0, update: 0, delete: 0 };
  const parts = ratioStr.split(",");
  for (const part of parts) {
    const [type, val] = part.split(":");
    if (val === undefined) continue;
    if (type === "update") ratios.update = parseInt(val);
    if (type === "delete") ratios.delete = parseInt(val);
    if (type === "insert") ratios.insert = parseInt(val);
  }
  return ratios;
}
