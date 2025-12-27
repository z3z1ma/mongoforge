import { Command } from "commander";
import { loadGenerationSchema } from "../../lib/generator/schema-loader.js";
import { createMongoInserter } from "../../lib/emitter/mongo-inserter.js";
import { MutationGenerator } from "../../lib/generator/mutation-engine.js";
import { DocumentIDCache } from "../../lib/utils/id-cache.js";
import { RateLimiter } from "../../lib/utils/rate-limiter.js";
import { logger } from "../../utils/logger.js";
import { Readable } from "stream";
import { MutationConfig } from "../../types/cdc.js";
import { MongoClient } from "mongodb";

/**
 * Creates the 'mutate' command for existing data modification
 */
export function createMutateCommand(): Command {
  const command = new Command("mutate");

  command
    .description(
      "Run update and delete workloads against existing MongoDB data",
    )
    .requiredOption("--uri <uri>", "MongoDB connection string")
    .requiredOption("--collection <collection>", "Target collection name")
    .option("--database <db>", "Database name")
    .requiredOption("--schema <path>", "JSON schema for document updates")
    .option(
      "--ratio <ratio>",
      "Operation ratios (e.g., update:70,delete:30)",
      "update:100",
    )
    .option("--rate-limit <ops>", "Operations per second", "0")
    .option("--count <n>", "Total operations to perform", "1000")
    .option("--batch-size <size>", "Bulk write batch size", "1000")
    .option("--id-cache-size <size>", "Max IDs to track in memory", "10000")
    .option(
      "--update-strategy <strategy>",
      "Update strategy: regenerate, partial, mixed",
      "partial",
    )
    .action(async (options) => {
      try {
        const schema = await loadGenerationSchema(options.schema);
        const dbName =
          options.database ||
          new MongoClient(options.uri).db().databaseName ||
          "test";

        const ratios = parseRatios(options.ratio);
        const config: MutationConfig = {
          targetUri: options.uri,
          database: dbName,
          collection: options.collection,
          ratios,
          rateLimit: parseInt(options.rateLimit),
          batchSize: parseInt(options.batchSize),
          updateStrategy: options.updateStrategy,
          deleteBehavior: "remove", // Default for now
          idCacheSize: parseInt(options.idCacheSize),
        };

        const cache = new DocumentIDCache(config.idCacheSize);

        // Initial ID fetch
        logger.info("Fetching initial IDs for cache...");
        const client = new MongoClient(config.targetUri);
        await client.connect();
        const cursor = client
          .db(config.database)
          .collection(config.collection)
          .find({}, { projection: { _id: 1 } })
          .limit(config.idCacheSize);

        for await (const doc of cursor) {
          cache.add(doc._id.toString());
        }
        await client.close();
        logger.info(`Cache populated with ${cache.size()} IDs`);

        if (cache.size() === 0) {
          throw new Error("No documents found in target collection to mutate");
        }

        const generator = new MutationGenerator(config, schema);
        const inserter = await createMongoInserter({
          uri: config.targetUri,
          database: config.database,
          collection: config.collection,
          batchSize: config.batchSize,
        });

        const rateLimiter = new RateLimiter(config.rateLimit || 0);
        const count = parseInt(options.count);
        let opsGenerated = 0;

        const opStream = new Readable({
          objectMode: true,
          async read() {
            if (opsGenerated >= count) {
              this.push(null);
              return;
            }

            const opType = selectOperation(config.ratios);
            const id = cache.getRandom();

            if (!id) {
              this.push(null);
              return;
            }

            const op = await generator.generateMutation(id, opType);

            if (opType === "delete") {
              cache.remove(id);
            }

            opsGenerated++;

            await rateLimiter.throttle();

            this.push(op);
          },
        });

        logger.info("Starting mutation workload...", {
          count,
          ratios: config.ratios,
        });
        const metrics = await inserter.bulkWrite(opStream);

        console.log(
          JSON.stringify(
            {
              status: "success",
              metrics: {
                total: metrics.totalDocuments,
                inserted: metrics.insertedDocuments,
                updated: metrics.updatedDocuments,
                deleted: metrics.deletedDocuments,
                failed: metrics.failedInserts,
                durationMs: metrics.durationMs,
                opsPerSec: Math.round(
                  metrics.totalDocuments / (metrics.durationMs / 1000),
                ),
              },
            },
            null,
            2,
          ),
        );
      } catch (error) {
        logger.error("Mutation failed", error);
        process.exit(1);
      }
    });

  return command;
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

function selectOperation(ratios: {
  insert: number;
  update: number;
  delete: number;
}): "update" | "delete" {
  const total = ratios.update + ratios.delete;
  const rand = Math.random() * total;
  if (rand < ratios.update) return "update";
  return "delete";
}
