import { Command } from 'commander';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { createReadStream, createWriteStream } from 'fs';
import { createMongoInserter } from '../../lib/emitter/mongo-inserter.js';
import { createNDJSONWriter } from '../../lib/emitter/ndjson-writer.js';
import { createGeneratorStream } from '../../lib/generator/stream.js';
import { loadGenerationSchema } from '../../lib/generator/schema-loader.js';
import { logger } from '../../utils/logger.js';

const pipelineAsync = promisify(pipeline);

/**
 * Create generate command with MongoDB insertion mode
 * @returns Commander Command
 */
export function createGenerateCommand(): Command {
  return new Command('generate')
    .description('Generate synthetic documents')
    .option('--generation-schema <path>', 'Path to generation schema file', './schemas/generation.schema.json')
    .option('--constraints <path>', 'Path to constraints file', './schemas/constraints.json')
    .option('--doc-count <number>', 'Number of documents to generate', '10000')
    .option('--seed <seed>', 'Seed for deterministic generation')
    .option('--output-path <path>', 'Output path (or "stdout")', 'stdout')
    .option('--output-format <format>', 'Output format', 'ndjson')
    .option('--target-uri <uri>', 'MongoDB URI for direct insertion')
    .option('--target-db <database>', 'Target database name')
    .option('--target-collection <collection>', 'Target collection name')
    .option('--collection-suffix <suffix>', 'Suffix for target collection')
    .option('--batch-size <number>', 'Batch size for MongoDB bulk inserts', '1000')
    .option('--write-concern <concern>', 'Write concern for MongoDB inserts', 'majority')
    .option('--ordered-inserts', 'Use ordered bulk inserts', false)
    .action(async (opts) => {
      try {
        const docCount = parseInt(opts.docCount, 10);
        const batchSize = parseInt(opts.batchSize, 10);

        // Load generation schema
        const schema = await loadGenerationSchema(opts.generationSchema, opts.constraints);

        // Create document generation stream
        const documentStream = createGeneratorStream(schema, docCount, batchSize);

        let insertionMetrics = null;

        // MongoDB Direct Insertion Mode
        if (opts.targetUri && opts.targetDb && opts.targetCollection) {
          const inserter = await createMongoInserter({
            uri: opts.targetUri,
            database: opts.targetDb,
            collection: opts.targetCollection,
            collectionSuffix: opts.collectionSuffix,
            batchSize: batchSize,
            writeConcern: opts.writeConcern,
            orderedInserts: opts.orderedInserts
          });

          insertionMetrics = await inserter.bulkInsert(documentStream);
        }
        // File/Stdout Output Mode
        else {
          const outputStream =
            opts.outputPath === 'stdout'
              ? process.stdout
              : createWriteStream(opts.outputPath);

          // Convert object stream to NDJSON strings before piping to output
          const ndjsonWriter = createNDJSONWriter();

          await pipelineAsync(
            documentStream,
            ndjsonWriter,
            outputStream
          );
        }

        // Prepare and output result
        const result = {
          status: 'success',
          phase: 'generation',
          output: {
            totalDocuments: docCount,
            ...(insertionMetrics
              ? {
                  destination: opts.targetUri + '/' + opts.targetDb + '/' + opts.targetCollection + (opts.collectionSuffix || ''),
                  insertedDocuments: insertionMetrics.insertedDocuments,
                  failedInserts: insertionMetrics.failedInserts
                }
              : {
                  format: opts.outputFormat,
                  path: opts.outputPath
                }
            )
          },
          metrics: insertionMetrics
            ? {
                durationMs: insertionMetrics.durationMs,
                throughput: Math.round(docCount / (insertionMetrics.durationMs / 1000)),
                memoryPeakMb: process.memoryUsage().heapUsed / 1024 / 1024
              }
            : null
        };

        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error('Generate command error', error);
        process.exit(1);
      }
    });
}
