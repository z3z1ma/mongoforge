#!/usr/bin/env tsx
/**
 * Analyze constraints.json bloat from dynamic key nested paths
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const constraintsPath = resolve(process.cwd(), 'schemas/constraints.json');
const generationSchemaPath = resolve(process.cwd(), 'schemas/generation.schema.json');

console.log('=== Analyzing constraints.json bloat ===\n');

// Load constraints
const constraints = JSON.parse(readFileSync(constraintsPath, 'utf-8'));
const generationSchema = JSON.parse(readFileSync(generationSchemaPath, 'utf-8'));

// Find dynamic key fields from generation schema
const dynamicKeyPaths = new Set<string>();
function findDynamicKeys(obj: any, path: string = '') {
  if (obj && typeof obj === 'object') {
    if (obj['x-dynamic-keys']?.enabled) {
      dynamicKeyPaths.add(path);
    }
    if (obj.properties) {
      for (const [key, value] of Object.entries(obj.properties)) {
        const newPath = path ? `${path}.${key}` : key;
        findDynamicKeys(value, newPath);
      }
    }
  }
}

findDynamicKeys(generationSchema);

console.log(`Dynamic key fields found: ${dynamicKeyPaths.size}`);
for (const path of dynamicKeyPaths) {
  console.log(`  - ${path}`);
}
console.log();

// Analyze arrayStats
const arrayStats = constraints.arrayStats || {};
const totalEntries = Object.keys(arrayStats).length;
let bloatedEntries = 0;
const bloatByDynamicField = new Map<string, number>();

for (const arrayPath of Object.keys(arrayStats)) {
  for (const dynamicPath of dynamicKeyPaths) {
    if (arrayPath.startsWith(dynamicPath + '.')) {
      bloatedEntries++;
      bloatByDynamicField.set(
        dynamicPath,
        (bloatByDynamicField.get(dynamicPath) || 0) + 1
      );
      break;
    }
  }
}

console.log(`=== Array Stats Analysis ===`);
console.log(`Total array stats entries: ${totalEntries}`);
console.log(`Bloated entries (nested under dynamic keys): ${bloatedEntries}`);
console.log(`Clean entries: ${totalEntries - bloatedEntries}`);
console.log(`Bloat percentage: ${((bloatedEntries / totalEntries) * 100).toFixed(1)}%`);
console.log();

console.log(`=== Bloat by Dynamic Field ===`);
for (const [dynamicPath, count] of Array.from(bloatByDynamicField.entries()).sort(
  (a, b) => b[1] - a[1]
)) {
  console.log(`  ${dynamicPath}: ${count} entries`);
}
console.log();

// Estimate size reduction
const constraintsStr = JSON.stringify(constraints, null, 2);
const currentSize = Buffer.byteLength(constraintsStr, 'utf-8');

// Create filtered version
const filteredArrayStats: Record<string, any> = {};
for (const [arrayPath, stats] of Object.entries(arrayStats)) {
  let isNested = false;
  for (const dynamicPath of dynamicKeyPaths) {
    if (arrayPath.startsWith(dynamicPath + '.')) {
      isNested = true;
      break;
    }
  }
  if (!isNested) {
    filteredArrayStats[arrayPath] = stats;
  }
}

const filteredConstraints = {
  ...constraints,
  arrayStats: filteredArrayStats,
};
const filteredStr = JSON.stringify(filteredConstraints, null, 2);
const filteredSize = Buffer.byteLength(filteredStr, 'utf-8');

console.log(`=== Size Impact ===`);
console.log(`Current size: ${(currentSize / 1024).toFixed(1)} KB`);
console.log(`Filtered size: ${(filteredSize / 1024).toFixed(1)} KB`);
console.log(`Reduction: ${(((currentSize - filteredSize) / currentSize) * 100).toFixed(1)}%`);
console.log(`Savings: ${((currentSize - filteredSize) / 1024).toFixed(1)} KB`);
