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

const pipelineAsync = promisify(pipeline);

/**
 * Create generate command with MongoDB insertion mode
 * @returns Commander Command
 */
export function createGenerateCommand(): Command {
  return new Command("generate")
    .description(
      "Generate synthetic documents with support for dynamic key patterns",
    )
    .option(
      "--generation-schema <path>",
      "Path to generation schema file",
      "./schemas/generation.schema.json",
    )
    .option(
      "--constraints <path>",
      "Path to constraints file",
      "./schemas/constraints.json",
    )
    .option("--doc-count <number>", "Number of documents to generate", "10000")
    .option("--seed <seed>", "Seed for deterministic generation")
    .option("--output-path <path>", 'Output path (or "stdout")', "stdout")
    .option(
      "--output-format <format>",
      "Output format: ndjson, json, mongo-cdc",
      "ndjson",
    )
    .option("--target-uri <uri>", "MongoDB URI for direct insertion")
    .option("--target-db <database>", "Target database name")
    .option("--target-collection <collection>", "Target collection name")
    .option("--collection-suffix <suffix>", "Suffix for target collection")
    .option(
      "--batch-size <number>",
      "Batch size for MongoDB bulk inserts",
      "1000",
    )
    .option(
      "--write-concern <concern>",
      "Write concern for MongoDB inserts",
      "majority",
    )
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
    .action(async (opts) => {
      try {
        const docCount = parseInt(opts.docCount, 10);
        const batchSize = parseInt(opts.batchSize, 10);

        // Load generation schema
        const schema = await loadGenerationSchema(
          opts.generationSchema,
          opts.constraints,
        );

        let insertionMetrics = null;

        // CDC Simulation Mode
        if (opts.outputFormat === "mongo-cdc") {
          if (!opts.targetUri || !opts.targetDb || !opts.targetCollection) {
            throw new Error(
              "--target-uri, --target-db, and --target-collection are required for mongo-cdc mode",
            );
          }

          const cacheSize = parseInt(opts.idCacheSize);
          const cache = new DocumentIDCache(cacheSize);
          const ratios = parseRatios(opts.operationRatios);
          const config: MutationConfig = {
            targetUri: opts.targetUri,
            database: opts.targetDb,
            collection: opts.targetCollection,
            ratios,
            rateLimit: parseInt(opts.rateLimit),
            batchSize: batchSize,
            updateStrategy: "partial",
            deleteBehavior: "remove",
            idCacheSize: cacheSize,
          };

          const inserter = await createMongoInserter({
            uri: opts.targetUri,
            database: opts.targetDb,
            collection: opts.targetCollection,
            collectionSuffix: opts.collectionSuffix,
            batchSize: batchSize,
            writeConcern: opts.writeConcern,
            orderedInserts: opts.orderedInserts,
          });

          // Warmup phase
          const warmupCount = parseInt(opts.warmupInserts);
          if (warmupCount > 0) {
            logger.info(`Running warmup phase: ${warmupCount} inserts`);

            // We need to capture IDs from warmup stream.
            const warmupConfig: MutationConfig = {
              ...config,
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

          const cdcStream = createCDCStream(schema, config, cache, docCount);
          const cdcInserter = await createMongoInserter({
            uri: opts.targetUri,
            database: opts.targetDb,
            collection: opts.targetCollection,
            collectionSuffix: opts.collectionSuffix,
            batchSize: batchSize,
            writeConcern: opts.writeConcern,
            orderedInserts: opts.orderedInserts,
          });

          insertionMetrics = await cdcInserter.bulkWrite(cdcStream);
        }
        // MongoDB Direct Insertion Mode
        else if (opts.targetUri && opts.targetDb && opts.targetCollection) {
          const documentStream = createGeneratorStream(
            schema,
            docCount,
            batchSize,
            opts.seed,
          );
          const inserter = await createMongoInserter({
            uri: opts.targetUri,
            database: opts.targetDb,
            collection: opts.targetCollection,
            collectionSuffix: opts.collectionSuffix,
            batchSize: batchSize,
            writeConcern: opts.writeConcern,
            orderedInserts: opts.orderedInserts,
          });

          insertionMetrics = await inserter.bulkInsert(documentStream);
        }
        // File/Stdout Output Mode
        else {
          const documentStream = createGeneratorStream(
            schema,
            docCount,
            batchSize,
            opts.seed,
          );
          const outputStream =
            opts.outputPath === "stdout"
              ? process.stdout
              : createWriteStream(opts.outputPath);

          // Create format writer based on output format option
          const formatWriter =
            opts.outputFormat === "json"
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
                    opts.targetUri +
                    "/" +
                    opts.targetDb +
                    "/" +
                    opts.targetCollection +
                    (opts.collectionSuffix || ""),
                  insertedDocuments: insertionMetrics.insertedDocuments,
                  updatedDocuments: insertionMetrics.updatedDocuments,
                  deletedDocuments: insertionMetrics.deletedDocuments,
                  failedInserts: insertionMetrics.failedInserts,
                }
              : {
                  format: opts.outputFormat,
                  path: opts.outputPath,
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
