/**
 * NDJSON Writer - Transform stream that converts objects to NDJSON
 */

import { Transform, TransformCallback } from "stream";

/**
 * Transform stream that converts object-mode chunks to NDJSON strings
 */
export class NDJSONWriter extends Transform {
  constructor() {
    super({
      objectMode: true, // Input is objects
      writableObjectMode: true,
      readableObjectMode: false, // Output is strings
    });
  }

  _transform(
    chunk: any,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const ndjsonLine = JSON.stringify(chunk) + "\n";
      this.push(ndjsonLine);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}

/**
 * Create NDJSON writer transform stream
 */
export function createNDJSONWriter(): Transform {
  return new NDJSONWriter();
}
