import { MutationConfig, CDCOperation } from "../../types/cdc";
import { generate, initializeFaker } from "./faker-engine.js";
import { registerCustomFormats } from "./custom-formats.js";
import { GenerationSchema } from "../../types/data-model";

/**
 * MutationGenerator handles the generation of update and delete operations
 * for existing documents based on a schema.
 */
export class MutationGenerator {
  private config: MutationConfig;
  private schema: GenerationSchema;
  private initialized = false;

  constructor(config: MutationConfig, schema: GenerationSchema) {
    this.config = config;
    this.schema = schema;
  }

  private initialize(): void {
    if (this.initialized) return;
    initializeFaker();
    registerCustomFormats();
    this.initialized = true;
  }

  /**
   * Generates a mutation operation (update or delete) for a given document ID.
   */
  async generateMutation(
    id: any,
    type: "update" | "delete",
  ): Promise<CDCOperation> {
    this.initialize();

    if (type === "delete") {
      return {
        type: "delete",
        collection: this.config.collection,
        payload: { _id: id },
      };
    }

    const strategy =
      this.config.updateStrategy === "mixed"
        ? Math.random() > 0.5
          ? "regenerate"
          : "partial"
        : this.config.updateStrategy;

    if (strategy === "regenerate") {
      const newDoc = await generate(this.schema);
      delete newDoc._id; // Ensure we don't try to change the immutable _id
      return {
        type: "update",
        collection: this.config.collection,
        payload: {
          filter: { _id: id },
          update: { $set: newDoc },
        },
      };
    }

    if (strategy === "partial") {
      const newDoc = await generate(this.schema);
      delete newDoc._id;

      const keys = Object.keys(newDoc);
      const numFields = Math.min(
        keys.length,
        Math.floor(Math.random() * 3) + 1,
      );
      const shuffled = keys.sort(() => 0.5 - Math.random());
      const selectedKeys = shuffled.slice(0, numFields);

      const updateSet: Record<string, any> = {};
      for (const key of selectedKeys) {
        updateSet[key] = newDoc[key];
      }

      return {
        type: "update",
        collection: this.config.collection,
        payload: {
          filter: { _id: id },
          update: { $set: updateSet },
        },
      };
    }

    // Default fallback
    return {
      type: "update",
      collection: this.config.collection,
      payload: {
        filter: { _id: id },
        update: { $set: { updatedAt: new Date() } },
      },
    };
  }
}
