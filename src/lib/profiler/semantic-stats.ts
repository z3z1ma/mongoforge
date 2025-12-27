/**
 * Semantic type statistics extraction
 * Detects email addresses, URLs, UUIDs, phone numbers, etc. in a streaming fashion.
 */

import { SemanticDetector, BUILTIN_DETECTORS } from "../inferencer/semantic-detectors.js";
import { SemanticStats } from "../../types/data-model.js";

/**
 * Accumulator for incremental semantic type detection
 */
export class SemanticStatsAccumulator {
  private stats = new Map<string, SemanticStats>();
  private detectors: SemanticDetector[];

  constructor(detectors: SemanticDetector[] = BUILTIN_DETECTORS) {
    this.detectors = [...detectors].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Add a document to the accumulation
   */
  addDocument(doc: any): void {
    this.traverse(doc);
  }

  /**
   * Recursive traversal to find string fields and check against detectors
   */
  private traverse(obj: any, pathPrefix = ""): void {
    if (obj === null || typeof obj !== "object") return;

    for (const key in obj) {
      const value = obj[key];
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // Skip metadata fields
      if (key.startsWith("__")) continue;

      if (typeof value === "string") {
        this.recordValue(fieldPath, key, value);
      } else if (Array.isArray(value)) {
        // Traverse array elements
        const arrayFieldPath = `${fieldPath}[]`;
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item === "string") {
            this.recordValue(arrayFieldPath, key, item);
          } else if (typeof item === "object" && item !== null) {
            this.traverse(item, arrayFieldPath);
          }
        }
      } else if (typeof value === "object" && value !== null) {
        // Traverse nested objects
        this.traverse(value, fieldPath);
      }
    }
  }

  private recordValue(fieldPath: string, fieldName: string, value: string): void {
    let stat = this.stats.get(fieldPath);

    if (!stat) {
      stat = {
        fieldPath,
        sampleSize: 0,
        matches: {},
      };
      this.stats.set(fieldPath, stat);
    }

    stat.sampleSize++;

    // Check against detectors
    for (const detector of this.detectors) {
      // Check if field name matches pattern
      const nameMatches = detector.fieldPatterns.some(
        (pattern) => pattern.test(fieldName) || pattern.test(fieldPath)
      );

      if (!nameMatches) {
        continue;
      }

      if (detector.valueValidator(value)) {
        stat.matches[detector.name] = (stat.matches[detector.name] || 0) + 1;
      }
    }
  }

  /**
   * Get calculated statistics for all tracked fields
   */
  getStats(): Map<string, SemanticStats> {
    const result = new Map<string, SemanticStats>();

    for (const [fieldPath, stat] of this.stats.entries()) {
      // Determine best match
      let bestMatch: { type: string; confidence: number } | undefined;

      for (const detector of this.detectors) {
        const matchCount = stat.matches[detector.name] || 0;
        const confidence = matchCount / stat.sampleSize;

        if (confidence >= detector.minConfidence) {
          bestMatch = {
            type: detector.name,
            confidence,
          };
          break; // Since detectors are sorted by priority, first match is best
        }
      }

      result.set(fieldPath, {
        ...stat,
        bestMatch,
      });
    }

    return result;
  }
}

/**
 * Calculate statistics for all semantic fields in a batch of documents
 */
export function calculateAllSemanticStats(
  documents: any[],
  detectors: SemanticDetector[] = BUILTIN_DETECTORS
): Map<string, SemanticStats> {
  const accumulator = new SemanticStatsAccumulator(detectors);
  documents.forEach((doc) => accumulator.addDocument(doc));
  return accumulator.getStats();
}
