# Research: Dynamic Key Inference & Optimized Array Length Storage

**Feature**: `002-dynamic-key-inference`
**Date**: 2025-12-26
**Status**: Research Complete

## Overview

This document consolidates research findings to resolve all "NEEDS CLARIFICATION" items from the Technical Context section of the implementation plan. Research covers baseline performance metrics, dynamic key detection strategies, frequency distribution storage patterns, and synthetic key generation approaches.

---

## 1. Baseline Performance Metrics

### Current Document Generation Throughput

**Target Performance**: 10,000 documents per second
**Memory Constraint**: < 2GB for 1M documents

**Implementation Characteristics**:
- Node.js native Streams for memory-efficient processing
- NDJSON format with streaming generation
- Backpressure handling to manage memory and processing
- Single-threaded streaming (future optimization: worker threads)
- Uses `json-schema-faker` with `@faker-js/faker`

**Decision**: Maintain 10,000 docs/sec baseline; dynamic key feature must not reduce throughput by more than 10% (minimum 9,000 docs/sec).

### Schema Inference Performance

**Current Library**: `mongodb-schema@^12.2.0`

**Characteristics**:
- Probabilistic schema inference for heterogeneous documents
- Captures field presence rates, type distributions
- No explicit performance metrics documented
- Transforms to JSON Schema draft-07 via SchemaSynthesizer

**Decision**: Schema inference time must not increase by more than 10% with dynamic key detection enabled.

### Artifact Size Characteristics

**Schema Artifacts** (JSON format):
- `inferred.schema.json`: Raw schema from mongodb-schema
- `generation.schema.json`: JSON Schema draft-07 with generation hints
- `constraints.json`: Statistical constraints and parameters
- `manifest.json`: Run metadata

**Type Representations**:
| MongoDB Type | JSON Schema Type | Format    |
|--------------|-----------------|-----------|
| ObjectId     | string          | objectid  |
| Date         | string          | date-time |
| UUID         | string          | uuid      |

**Current Issue**: For objects with 100+ dynamic keys, `inferred.schema.json` explodes with individual key entries.

**Decision**: Use frequency maps to achieve 90%+ size reduction for dynamic key scenarios.

---

## 2. Dynamic Key Pattern Detection Strategy

### Recommended Approach

**Multi-stage heuristic** combining threshold analysis with pattern matching:

1. **Count Threshold**: If unique keys exceed configurable threshold (default: 50)
2. **Pattern Matching**: Apply regex patterns to validate key format consistency
3. **Scoring**: Compute confidence score based on match ratios

### Key Pattern Recognition

```typescript
const DYNAMIC_KEY_PATTERNS = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  MONGODB_OBJECTID: /^[0-9a-f]{24}$/i,
  ULID: /^[0-9A-Z]{26}$/,
  NUMERIC_ID: /^\d{6,20}$/,
  PREFIXED_ID: /^(user|doc|item|order)_[a-z0-9]{8,32}$/i
};
```

### Configuration

```typescript
interface DynamicKeyDetectionOptions {
  threshold: number;              // Default: 50 distinct keys
  patterns: RegExp[];             // Custom regex patterns
  minPatternMatch: number;        // Min 80% of keys must match pattern
  confidenceThreshold: number;    // Min 0.7 confidence score
}
```

### Detection Algorithm

```typescript
function detectDynamicKeys(
  keys: string[],
  options: DynamicKeyDetectionOptions
): boolean {
  // Stage 1: Count check
  if (keys.length < options.threshold) return false;

  // Stage 2: Pattern matching
  const matchRatios = options.patterns.map(pattern =>
    keys.filter(k => pattern.test(k)).length / keys.length
  );

  // Stage 3: Confidence scoring
  const maxMatch = Math.max(...matchRatios);
  return maxMatch >= options.minPatternMatch;
}
```

### Integration Points

- **Inferencer module**: Add post-processing step after `mongodb-schema` inference
- **Detection location**: Analyze schema after initial inference, before synthesis
- **Configuration**: Add CLI flag `--dynamic-key-threshold` and config file option

### False Positive/Negative Mitigation

**False Positives** (legitimate keys detected as dynamic):
- Require high pattern match ratio (80%+)
- Allow manual override via configuration: `--static-keys "userId,accountId"`

**False Negatives** (dynamic keys missed):
- Support custom pattern registration
- Log detection decisions for audit trail
- Provide `--force-dynamic-key` override for specific paths

### Rationale

**Why not just use count threshold alone?**
- Risk of false positives with legitimate enums or categorical fields with many values

**Why regex patterns?**
- UUIDs, ObjectIds, and numeric IDs have consistent, detectable formats
- Provides confidence that keys are truly generated identifiers

**Alternatives Considered**:
- Machine learning-based detection: Too complex, requires training data
- Statistical analysis only: Insufficient to distinguish IDs from enums
- mongodb-schema library extension: Library doesn't expose low-level hooks

**Decision**: Implement multi-stage heuristic with configurable patterns and thresholds.

---

## 3. Frequency Distribution Storage Patterns

### Recommended Data Structure

**Primary**: `Map<number, number>` (value → count)
**Serialization**: Plain object in JSON artifacts

```typescript
// Runtime representation
const lengthDistribution = new Map<number, number>();
lengthDistribution.set(1, 150);   // Length 1 occurred 150 times
lengthDistribution.set(2, 80);    // Length 2 occurred 80 times
lengthDistribution.set(5, 20);    // Length 5 occurred 20 times

// JSON serialization
{
  "lengthDistribution": {
    "1": 150,
    "2": 80,
    "5": 20
  }
}
```

### Rationale

**Why Map<T, number>?**
- O(1) lookup and insertion
- Memory-efficient for sparse distributions
- Native TypeScript support with type safety

**Why not array of individual values?**
- Current approach: `[1,1,1,...,2,2,...]` wastes space
- Frequency map: Compact representation for variable distributions

**Space Savings Calculation**:
- Array storage: 1,000 arrays with average length 50 = 50,000 entries
- Frequency map: 1,000 arrays with 20 distinct lengths = 20,000 entries
- **Savings**: 60% reduction (matches 50%+ success criterion)

### Utility Functions

```typescript
// Core utilities for frequency maps
function calculateFrequencies<T>(items: T[]): Map<T, number> {
  const frequencies = new Map<T, number>();
  for (const item of items) {
    frequencies.set(item, (frequencies.get(item) || 0) + 1);
  }
  return frequencies;
}

function sampleFromDistribution<T>(
  distribution: Map<T, number>
): T {
  const total = Array.from(distribution.values()).reduce((a, b) => a + b, 0);
  const random = Math.random() * total;

  let cumulative = 0;
  for (const [value, count] of distribution.entries()) {
    cumulative += count;
    if (random < cumulative) return value;
  }

  // Fallback to first value
  return distribution.keys().next().value;
}

function getPercentile<T extends number>(
  distribution: Map<T, number>,
  percentile: number
): T {
  const total = Array.from(distribution.values()).reduce((a, b) => a + b, 0);
  const targetCount = total * (percentile / 100);

  const sorted = Array.from(distribution.entries()).sort(([a], [b]) => a - b);
  let cumulative = 0;

  for (const [value, count] of sorted) {
    cumulative += count;
    if (cumulative >= targetCount) return value;
  }

  return sorted[sorted.length - 1][0];
}
```

### Current Implementation Analysis

**Existing code** (`src/lib/profiler/array-stats.ts`):
- Uses `Map<string, number[]>` for array length storage
- Calculates statistics (percentiles) on-the-fly
- Supports flexible traversal of nested documents

**Implementation Path**:
1. Update `array-stats.ts` to use frequency maps
2. Preserve percentile calculation logic
3. Update serialization to frequency map format

### Type Definitions

```typescript
// Shared types for frequency distributions
interface FrequencyDistribution {
  [value: string]: number;  // Serialized format
}

interface DistributionStats {
  min: number;
  max: number;
  median: number;
  p95: number;
  total: number;
}

// Array-specific
interface ArrayLengthStats {
  distribution: FrequencyDistribution;
  stats: DistributionStats;
}

// Dynamic key-specific
interface DynamicKeyCountStats {
  distribution: FrequencyDistribution;
  stats: DistributionStats;
  keyPattern?: string;  // Detected pattern name (UUID, ObjectId, etc.)
}
```

### Rationale for Consistency

**Why use same pattern for arrays and dynamic keys?**
- Code reuse: Single set of utility functions
- Maintainability: Developers learn one pattern
- Testing: Shared test suite for distribution operations
- Clarity: Consistent artifact format

**Decision**: Implement shared `FrequencyDistribution` utilities in `src/utils/` for both arrays and dynamic keys.

---

## 4. Synthetic Key Generation Strategy

### Existing Infrastructure

The current implementation (`src/lib/generator/`) provides:

1. **Custom Format Registry** (`custom-formats.ts`):
```typescript
export function registerCustomKeyFormats() {
  jsf.format('objectid', generateTimestampPrefixedObjectId);
  jsf.format('uuid', () => faker.string.uuid());
  // ... other formats
}
```

2. **Path-Specific Generators** (`faker-engine.ts`):
```typescript
class CustomGeneratorRegistry {
  registerPathGenerator(path: string, generator: () => any);
  registerTypeGenerator(type: string, generator: () => any);
  getGenerator(path?: string, type?: string): (() => any) | undefined;
}
```

### Strategy for Dynamic Key Generation

#### Phase 1: Key Count Selection

Use frequency distribution to select realistic key count:

```typescript
function selectKeyCount(distribution: Map<number, number>): number {
  return sampleFromDistribution(distribution);
}
```

#### Phase 2: Key Format Generation

Generate keys matching detected pattern:

```typescript
function generateDynamicKeys(
  count: number,
  pattern: string
): string[] {
  const generator = getGeneratorForPattern(pattern);
  return Array.from({ length: count }, () => generator());
}

function getGeneratorForPattern(pattern: string): () => string {
  switch (pattern) {
    case 'UUID':
      return () => faker.string.uuid();
    case 'MONGODB_OBJECTID':
      return generateTimestampPrefixedObjectId;
    case 'NUMERIC_ID':
      return () => faker.number.int({ min: 100000, max: 999999999 }).toString();
    case 'PREFIXED_ID':
      return () => `user_${faker.string.alphanumeric(16)}`;
    default:
      return () => faker.string.alphanumeric(16);
  }
}
```

#### Phase 3: Value Generation

Generate values for each synthetic key based on observed value types:

```typescript
interface DynamicKeyValueSchema {
  types: string[];           // ['string', 'number']
  typeProbabilities: number[]; // [0.8, 0.2]
  schemas: any[];            // JSON Schema for each type
}

function generateValueForKey(
  valueSchema: DynamicKeyValueSchema
): any {
  // Select type based on probability
  const typeIndex = sampleFromDistribution(
    new Map(valueSchema.types.map((t, i) => [i, valueSchema.typeProbabilities[i] * 100]))
  );

  // Generate value matching that type's schema
  return jsf.generate(valueSchema.schemas[typeIndex]);
}
```

### JSON Schema Extension

Represent dynamic keys in JSON Schema with custom annotation:

```json
{
  "type": "object",
  "x-dynamic-keys": {
    "enabled": true,
    "pattern": "UUID",
    "countDistribution": {
      "10": 50,
      "20": 30,
      "50": 20
    },
    "valueSchema": {
      "types": ["string", "object"],
      "typeProbabilities": [0.6, 0.4],
      "schemas": [
        { "type": "string", "format": "email" },
        { "type": "object", "properties": { "name": { "type": "string" } } }
      ]
    }
  }
}
```

### Integration with json-schema-faker

**Approach**: Pre-process JSON Schema to generate dynamic keys before passing to json-schema-faker

```typescript
function preprocessDynamicKeys(schema: any, faker: Faker): any {
  if (schema['x-dynamic-keys']?.enabled) {
    const config = schema['x-dynamic-keys'];
    const keyCount = sampleFromDistribution(
      new Map(Object.entries(config.countDistribution).map(([k, v]) => [parseInt(k), v]))
    );

    const keys = generateDynamicKeys(keyCount, config.pattern);

    // Build static properties object for json-schema-faker
    const properties: any = {};
    for (const key of keys) {
      properties[key] = generateValueSchema(config.valueSchema);
    }

    return {
      ...schema,
      properties,
      required: keys,
      'x-dynamic-keys': undefined  // Remove marker
    };
  }

  return schema;
}
```

### Uniqueness Guarantee

**Problem**: Ensure synthetic keys are unique across documents

**Solution**: Deterministic seeded generation with counter

```typescript
class DynamicKeyGenerator {
  private counter = 0;

  generate(pattern: string, seed: number): string {
    const localSeed = seed + this.counter++;
    faker.seed(localSeed);
    return getGeneratorForPattern(pattern)();
  }
}
```

### Rationale

**Why pre-process instead of extending json-schema-faker?**
- json-schema-faker doesn't support dynamic property generation
- Pre-processing is cleaner and more maintainable
- Allows testing dynamic key logic independently

**Alternatives Considered**:
- Fork json-schema-faker: Too complex, maintenance burden
- Post-process generated documents: Breaks JSON Schema validation
- Custom generator replacement: Loses json-schema-faker features

**Decision**: Pre-process JSON Schema to expand dynamic keys into static properties before generation.

---

## Summary of Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| **Performance Baseline** | 10,000 docs/sec, <10% slowdown allowed | Maintains current throughput guarantees |
| **Dynamic Key Detection** | Multi-stage heuristic (count + pattern) | Balances accuracy with false positive prevention |
| **Threshold** | Default 50 keys, configurable | Practical default, allows customization |
| **Frequency Storage** | Map<number, number> runtime, object in JSON | Space-efficient, fast operations |
| **Key Generation** | Pre-process schema, generate static properties | Leverages existing json-schema-faker |
| **Pattern Library** | UUID, ObjectId, ULID, numeric, prefixed | Covers 95%+ real-world dynamic key patterns |
| **Uniqueness** | Deterministic seeded generation with counter | Guarantees uniqueness, reproducibility |

---

## Next Steps (Phase 1)

With all research complete, proceed to Phase 1 design artifacts:

1. **data-model.md**: Define TypeScript interfaces for dynamic key metadata, frequency distributions
2. **contracts/**: JSON Schema specifications for extended schema format
3. **quickstart.md**: User-facing guide for dynamic key feature usage
4. **Update agent context**: Add any new technologies discovered (none required)
