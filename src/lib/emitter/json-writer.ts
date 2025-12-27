/**
 * JSON array writer - Transform stream that converts object stream to JSON array format
 */

import { Transform, TransformCallback } from "stream";

/**
 * Transform stream that converts objects to a JSON array
 * Writes [ at start, comma-separated JSON objects, and ] at end
 */
export class JSONWriter extends Transform {
  private isFirstItem = true;

  constructor() {
    super({
      objectMode: true, // Input is objects
      writableObjectMode: true,
      readableObjectMode: false, // Output is strings
    });
  }

  _construct(callback: (error?: Error | null) => void): void {
    // Write opening bracket
    this.push("[\n");
    callback();
  }

  _transform(
    chunk: any,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      let jsonLine: string;

      if (this.isFirstItem) {
        jsonLine = "  " + JSON.stringify(chunk);
        this.isFirstItem = false;
      } else {
        jsonLine = ",\n  " + JSON.stringify(chunk);
      }

      this.push(jsonLine);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    // Write closing bracket
    this.push("\n]\n");
    callback();
  }
}

/**
 * Create a JSON array writer transform stream
 */
export function createJSONWriter(): Transform {
  return new JSONWriter();
}
