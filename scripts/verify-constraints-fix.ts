#!/usr/bin/env tsx
/**
 * Verify constraints.json bloat fix
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const constraintsPath = resolve(process.cwd(), 'schemas/constraints.json');
const generationSchemaPath = resolve(process.cwd(), 'schemas/generation.schema.json');

console.log('=== Verifying constraints.json fix ===\n');

// Load artifacts
const constraints = JSON.parse(readFileSync(constraintsPath, 'utf-8'));
const generationSchema = JSON.parse(readFileSync(generationSchemaPath, 'utf-8'));

// Find dynamic key fields
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

console.log(`Dynamic key fields: ${dynamicKeyPaths.size}`);
for (const path of dynamicKeyPaths) {
  console.log(`  - ${path}`);
}
console.log();

// Check for bloat
const arrayStats = constraints.arrayStats || {};
const violations: string[] = [];

for (const arrayPath of Object.keys(arrayStats)) {
  for (const dynamicPath of dynamicKeyPaths) {
    if (arrayPath.startsWith(dynamicPath + '.')) {
      violations.push(arrayPath);
      break;
    }
  }
}

console.log(`=== Verification Results ===`);
console.log(`Total array stats entries: ${Object.keys(arrayStats).length}`);
console.log(`Bloated entries (SHOULD BE 0): ${violations.length}`);

if (violations.length === 0) {
  console.log('✅ PASS: No array stats nested under dynamic key fields');
} else {
  console.log('❌ FAIL: Found bloated entries:');
  for (const violation of violations.slice(0, 10)) {
    console.log(`  - ${violation}`);
  }
  if (violations.length > 10) {
    console.log(`  ... and ${violations.length - 10} more`);
  }
  process.exit(1);
}

// Check file size
const constraintsStr = JSON.stringify(constraints, null, 2);
const size = Buffer.byteLength(constraintsStr, 'utf-8');
console.log(`\nFile size: ${(size / 1024).toFixed(1)} KB`);

if (size > 50000) {
  // 50KB threshold
  console.log('⚠️  WARNING: File size exceeds 50KB, may indicate bloat');
} else {
  console.log('✅ File size is reasonable');
}
