import { Readable } from "stream";
import { GenerationSchema } from "../../types/data-model.js";
import {
  CDCOperation,
  MutationConfig,
  OperationType,
} from "../../types/cdc.js";
import { generate, initializeFaker } from "./faker-engine.js";
import { MutationGenerator } from "./mutation-engine.js";
import { DocumentIDCache } from "../utils/id-cache.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import { logger } from "../../utils/logger.js";

/**
 * CDCGeneratorStream yields mixed insert, update, and delete operations.
 */
export class CDCGeneratorStream extends Readable {
  private schema: GenerationSchema;
  private config: MutationConfig;
  private cache: DocumentIDCache;
  private mutator: MutationGenerator;
  private rateLimiter: RateLimiter;
  private totalOps: number;
  private opsGenerated: number = 0;
  private initialized: boolean = false;

  constructor(
    schema: GenerationSchema,
    config: MutationConfig,
    cache: DocumentIDCache,
    totalOps: number,
  ) {
    super({ objectMode: true });
    this.schema = schema;
    this.config = config;
    this.cache = cache;
    this.totalOps = totalOps;
    this.mutator = new MutationGenerator(config, schema);
    this.rateLimiter = new RateLimiter(config.rateLimit || 0);
  }

  private async initialize() {
    if (this.initialized) return;
    initializeFaker();
    this.initialized = true;
  }

  async _read() {
    try {
      await this.initialize();

      if (this.opsGenerated >= this.totalOps) {
        this.push(null);
        return;
      }

      const opType = this.selectOperation();
      let op: CDCOperation;

      if (opType === "insert") {
        const doc = await generate(this.schema);
        if (doc._id) {
          this.cache.add(doc._id.toString());
        }
        op = {
          type: "insert",
          collection: this.config.collection,
          payload: doc,
        };
      } else {
        const id = this.cache.getRandom();
        if (!id) {
          // If cache is empty, fallback to insert if allowed, or skip
          const doc = await generate(this.schema);
          if (doc._id) this.cache.add(doc._id.toString());
          op = {
            type: "insert",
            collection: this.config.collection,
            payload: doc,
          };
        } else {
          op = await this.mutator.generateMutation(id, opType);
          if (opType === "delete") {
            if (this.config.deleteBehavior === "remove") {
              this.cache.remove(id);
            } else if (this.config.deleteBehavior === "tombstone") {
              this.cache.tombstone(id);
            }
          }
        }
      }

      this.opsGenerated++;

      // Throttling
      await this.rateLimiter.throttle();

      this.push(op);

      if (this.opsGenerated % 1000 === 0) {
        logger.debug("Generated CDC operations", { count: this.opsGenerated });
      }
    } catch (error) {
      this.destroy(error as Error);
    }
  }

  private selectOperation(): OperationType {
    const { insert, update, delete: del } = this.config.ratios;
    const total = insert + update + del;
    const rand = Math.random() * total;

    if (rand < insert) return "insert";
    if (rand < insert + update) return "update";
    return "delete";
  }
}

export function createCDCStream(
  schema: GenerationSchema,
  config: MutationConfig,
  cache: DocumentIDCache,
  totalOps: number,
): Readable {
  return new CDCGeneratorStream(schema, config, cache, totalOps);
}
