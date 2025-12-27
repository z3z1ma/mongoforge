/**
 * Emitter module - handles output formats for generated documents
 * Includes MongoDB bulk insertion and file/stream writers
 */
export * from "./types.js";
export * from "./mongo-inserter.js";
export * from "./ndjson-writer.js";
export * from "./json-writer.js";
