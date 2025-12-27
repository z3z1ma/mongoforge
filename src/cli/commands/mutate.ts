import { DocumentIDCache } from '../../lib/utils/id-cache.js';
import { RateLimiter } from '../../lib/utils/rate-limiter.js';
import { logger } from '../../utils/logger.js';
import { Readable } from 'stream';
import { MutationConfig } from '../../types/cdc.js';
import { MongoClient } from 'mongodb';

/**
 * Creates the 'mutate' command for existing data modification
 */
export function createMutateCommand(): Command {
  const command = new Command('mutate');
// ...
        const generator = new MutationGenerator(config, schema);
        const inserter = await createMongoInserter({
          uri: config.targetUri,
          database: config.database,
          collection: config.collection,
          batchSize: config.batchSize
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
            
            if (opType === 'delete') {
              cache.remove(id);
            }

            opsGenerated++;
            
            await rateLimiter.throttle();

            this.push(op);
          }
        });
// ...


        logger.info('Starting mutation workload...', { count, ratios: config.ratios });
        const metrics = await inserter.bulkWrite(opStream);
        
        console.log(JSON.stringify({
          status: 'success',
          metrics: {
            total: metrics.totalDocuments,
            inserted: metrics.insertedDocuments,
            updated: metrics.updatedDocuments,
            deleted: metrics.deletedDocuments,
            failed: metrics.failedInserts,
            durationMs: metrics.durationMs,
            opsPerSec: Math.round(metrics.totalDocuments / (metrics.durationMs / 1000))
          }
        }, null, 2));

      } catch (error) {
        logger.error('Mutation failed', error);
        process.exit(1);
      }
    });

  return command;
}

function parseRatios(ratioStr: string) {
  const ratios = { insert: 0, update: 0, delete: 0 };
  const parts = ratioStr.split(',');
  for (const part of parts) {
    const [type, val] = part.split(':');
    if (type === 'update') ratios.update = parseInt(val);
    if (type === 'delete') ratios.delete = parseInt(val);
    if (type === 'insert') ratios.insert = parseInt(val);
  }
  return ratios;
}

function selectOperation(ratios: { insert: number, update: number, delete: number }): 'update' | 'delete' {
  const total = ratios.update + ratios.delete;
  const rand = Math.random() * total;
  if (rand < ratios.update) return 'update';
  return 'delete';
}

