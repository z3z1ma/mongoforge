/**
 * Document size bucket calculation
 */

import { DocumentSizeBucket, SizeProxyType } from "../../types/data-model.js";

/**
 * Calculate leaf field count (non-object, non-array values)
 */
function countLeafFields(obj: any): number {
  let count = 0;

  function traverse(value: any): void {
    if (value === null || value === undefined) {
      count++;
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => traverse(item));
      return;
    }

    if (typeof value === "object") {
      for (const v of Object.values(value)) {
        traverse(v);
      }
      return;
    }

    // Primitive value (leaf)
    count++;
  }

  traverse(obj);
  return count;
}

/**
 * Calculate sum of all array lengths
 */
function sumArrayLengths(obj: any): number {
  let sum = 0;

  function traverse(value: any): void {
    if (Array.isArray(value)) {
      sum += value.length;
      value.forEach((item) => traverse(item));
      return;
    }

    if (typeof value === "object" && value !== null) {
      for (const v of Object.values(value)) {
        traverse(v);
      }
    }
  }

  traverse(obj);
  return sum;
}

/**
 * Calculate byte size approximation (JSON.stringify length)
 */
function calculateByteSize(obj: any): number {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}

/**
 * Calculate size proxy for a document
 */
export function calculateSizeProxy(doc: any, proxyType: SizeProxyType): number {
  switch (proxyType) {
    case "leafFieldCount":
      return countLeafFields(doc);
    case "arrayLengthSum":
      return sumArrayLengths(doc);
    case "byteSize":
      return calculateByteSize(doc);
    default:
      throw new Error("Unknown size proxy type: " + proxyType);
  }
}

/**
 * Create size buckets from documents
 */
export function createSizeBuckets(
  documents: any[],
  proxyType: SizeProxyType,
  bucketConfig?: Array<{ id: string; min: number; max: number }>,
): DocumentSizeBucket[] {
  // Calculate size proxies for all documents
  const sizes = documents.map((doc) => calculateSizeProxy(doc, proxyType));

  // If no bucket config provided, create automatic buckets
  if (!bucketConfig) {
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    const range = max - min;

    bucketConfig = [
      { id: "small", min: min, max: min + range * 0.33 },
      { id: "medium", min: min + range * 0.33, max: min + range * 0.67 },
      { id: "large", min: min + range * 0.67, max: max },
    ];
  }

  // Classify documents into buckets
  const buckets: DocumentSizeBucket[] = bucketConfig.map((config) => ({
    bucketId: config.id,
    sizeRange: { min: config.min, max: config.max },
    sizeProxy: proxyType,
    count: 0,
    probability: 0,
  }));

  // Count documents in each bucket
  for (const size of sizes) {
    for (const bucket of buckets) {
      if (size >= bucket.sizeRange.min && size <= bucket.sizeRange.max) {
        bucket.count++;
        break;
      }
    }
  }

  // Calculate probabilities
  const total = documents.length;
  for (const bucket of buckets) {
    bucket.probability = bucket.count / total;
  }

  return buckets;
}
