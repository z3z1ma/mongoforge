/**
 * Emitter module types
 */

export interface EmitterOptions {
  format: "ndjson" | "json";
  destination: string;
  batchSize?: number;
}

export interface EmitterResult {
  written: number;
  destination: string;
}
