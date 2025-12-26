# Quickstart Guide: MongoForge Synthetic Document Generator

**Feature**: 001-mongodb-doc-gen
**Date**: 2025-12-26
**Audience**: Database engineers, QA engineers, load testing teams

## What is MongoForge?

MongoForge is a CLI tool that generates high-volume synthetic MongoDB documents for load testing and CDC (Change Data Capture) validation. It samples your existing MongoDB collections, infers schema and statistical constraints, then generates synthetic documents that preserve structural fidelity (nested objects, array sizes, document shapes) without semantic fidelity.

**Key Benefits**:
- Generate millions of test documents without exposing production data
- Preserve document size and array length distributions for realistic load testing
- Reproducible generation with seed control
- High throughput (10,000+ docs/second)

---

## Prerequisites

- **MongoDB**: 4.0 or later (for source collections)
- **Node.js**: 18.x or later
- **Access**: Read permission on source MongoDB collection

---

## Installation

```bash
# Install globally via npm
npm install -g mongoforge

# Or install locally in project
npm install --save-dev mongoforge

# Verify installation
mongoforge --version
```

---

## Quick Start (3 Commands)

### Step 1: Infer Schema from Source Collection

Sample your MongoDB collection and generate schema + constraints:

```bash
mongoforge infer \
  --source-uri mongodb://localhost:27017 \
  --source-db production \
  --source-collection users \
  --sample-size 10000 \
  --output-dir ./schemas
```

**Output**:
```
✓ Connected to MongoDB
✓ Sampled 10,000 documents from production.users
✓ Inferred schema with 45 fields
✓ Tracked 8 array paths
✓ Generated artifacts:
  - ./schemas/inferred.schema.json
  - ./schemas/generation.schema.json
  - ./schemas/constraints.json
✓ Completed in 3.2s
```

**What happened**:
- Sampled 10,000 documents from `production.users` collection
- Inferred field types, optionality, nested structures
- Calculated array length statistics (min/max/percentiles)
- Produced 3 JSON files for generation phase

---

### Step 2: Generate Synthetic Documents

Create 100,000 synthetic documents preserving sample characteristics:

```bash
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 100000 \
  --seed "test-seed-123" \
  --output-path ./output/synthetic-users.ndjson
```

**Output**:
```
✓ Loaded generation schema and constraints
✓ Initialized PRNG with seed: test-seed-123
✓ Generating 100,000 documents...
  [====================] 100% | 100,000/100,000 | 8,000 docs/s
✓ Written to ./output/synthetic-users.ndjson (50 MB)
✓ Run manifest: ./output/manifest-550e8400.json
✓ Completed in 12.5s
```

**What happened**:
- Generated 100,000 synthetic documents matching inferred schema
- Array lengths match sample distributions (within 10%)
- Document sizes match sample distributions (within 20%)
- Output is NDJSON format (one JSON object per line)
- Reproducible: same seed → same output

---

### Step 3: Validate Generated Documents (Optional)

Verify synthetic documents meet quality requirements:

```bash
mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path ./output/synthetic-users.ndjson \
  --output-path ./output/validation-report.json
```

**Output**:
```
✓ Loaded 100,000 synthetic documents
✓ Schema conformance: 100% (100,000/100,000 valid)
✓ Array length distributions: PASS (within 10% tolerance)
✓ Document size distributions: PASS (within 20% tolerance)
✓ Key uniqueness (_id): PASS (100,000 unique keys)
✓ Validation report: ./output/validation-report.json
✓ Overall: PASS
```

---

## Complete Example: Production → Test Database

```bash
# 1. Infer schema from production
mongoforge infer \
  --source-uri mongodb://prod-host:27017 \
  --source-db myapp \
  --source-collection users \
  --sample-size 10000 \
  --output-dir ./schemas

# 2. Generate synthetic documents
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 500000 \
  --seed "load-test-2025-12" \
  --output-path ./output/synthetic-users.ndjson

# 3. Validate quality
mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path ./output/synthetic-users.ndjson

# 4. Import to test database
mongoimport \
  --uri mongodb://test-host:27017 \
  --db myapp_test \
  --collection users_synthetic \
  --file ./output/synthetic-users.ndjson
```

---

## Advanced Usage

### Using Configuration Files

Create a config file to avoid typing long commands:

**`mongoforge.config.yaml`**:
```yaml
infer:
  source:
    uri: mongodb://localhost:27017
    database: production
    collection: users
  sampling:
    sampleSize: 10000
    strategy: random
  output:
    dir: ./schemas

generate:
  generationSchema: ./schemas/generation.schema.json
  constraints: ./schemas/constraints.json
  docCount: 100000
  seed: "test-seed-123"
  output:
    format: ndjson
    path: ./output/synthetic-users.ndjson
```

Run commands with config:

```bash
mongoforge infer --config mongoforge.config.yaml
mongoforge generate --config mongoforge.config.yaml
```

---

### Direct MongoDB Insertion

Skip NDJSON file and insert directly into MongoDB:

```bash
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 100000 \
  --target-uri mongodb://localhost:27017 \
  --target-db test \
  --target-collection users_synthetic \
  --batch-size 1000 \
  --write-concern majority
```

**Output**:
```
✓ Connected to MongoDB test.users_synthetic
✓ Generating 100,000 documents...
  [====================] 100% | 100,000/100,000
✓ Inserted 100,000 documents (0 failed)
✓ Throughput: 5,400 docs/s
✓ Completed in 18.5s
```

---

### Streaming to stdout

Generate to stdout and pipe to other tools:

```bash
# Generate and pipe to mongoimport
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 10000 \
  --output-path stdout | \
mongoimport --db test --collection users --file -

# Generate and pipe to jq for inspection
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 100 \
  --output-path stdout | \
jq '.email'
```

---

### Reproducible Generation

Use seeds for deterministic output:

```bash
# Run 1
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 1000 \
  --seed "my-seed" \
  --output-path ./output/run1.ndjson

# Run 2 (identical output)
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 1000 \
  --seed "my-seed" \
  --output-path ./output/run2.ndjson

# Verify identical
diff ./output/run1.ndjson ./output/run2.ndjson
# (no output = files are identical)
```

---

### Custom Key Fields

Enforce uniqueness for additional fields beyond `_id`:

```bash
mongoforge infer \
  --source-uri mongodb://localhost:27017 \
  --source-db production \
  --source-collection users \
  --key-fields accountId,email \
  --enforce-unique-keys \
  --uniqueness-scope run \
  --output-dir ./schemas
```

Now `accountId` and `email` will be unique across the entire generation run.

---

## Understanding Output Files

### Discovery Phase Artifacts

After `mongoforge infer`, you'll have:

1. **`inferred.schema.json`**: Raw schema from `mongodb-schema` library
   - Field paths, type distributions, optionality rates
   - Human-readable but not used directly for generation

2. **`generation.schema.json`**: JSON Schema draft-07 with vendor extensions
   - Used by generator to produce synthetic documents
   - Includes `x-gen` keywords for MongoDB types, array lengths

3. **`constraints.json`**: Statistical constraints
   - Array length statistics (min/max/percentiles)
   - Document size buckets
   - Key field configuration

### Generation Phase Artifacts

After `mongoforge generate`, you'll have:

1. **`synthetic-<collection>.ndjson`**: Generated documents (NDJSON format)
   - One JSON object per line
   - Import-ready for `mongoimport`

2. **`manifest-<runId>.json`**: Run manifest
   - Tool version, seed, configuration
   - Artifact hashes (SHA-256)
   - Performance metrics (throughput, memory, duration)

### Validation Phase Artifacts

After `mongoforge validate`, you'll have:

1. **`validation-report.json`**: Quality report
   - Schema conformance rate
   - Array length distribution comparisons
   - Document size distribution comparisons
   - Key uniqueness checks

---

## Common Patterns

### Load Testing Pipeline

```bash
# 1. Infer schema from production (once)
mongoforge infer \
  --source-uri mongodb://prod:27017 \
  --source-db myapp \
  --source-collection orders \
  --sample-size 20000 \
  --output-dir ./schemas/orders

# 2. Generate large dataset for load test
mongoforge generate \
  --generation-schema ./schemas/orders/generation.schema.json \
  --constraints ./schemas/orders/constraints.json \
  --doc-count 5000000 \
  --seed "load-test-$(date +%Y%m%d)" \
  --target-uri mongodb://test:27017 \
  --target-db loadtest \
  --target-collection orders \
  --batch-size 5000

# 3. Run load test with synthetic data
# (Your load testing tool here)
```

---

### CDC Testing Pipeline

```bash
# 1. Generate initial dataset
mongoforge generate \
  --generation-schema ./schemas/users/generation.schema.json \
  --constraints ./schemas/users/constraints.json \
  --doc-count 1000000 \
  --target-uri mongodb://cdc-source:27017 \
  --target-db myapp \
  --target-collection users

# 2. CDC pipeline captures changes from myapp.users
# (Your CDC pipeline: Debezium, MongoDB Change Streams, etc.)

# 3. Generate additional inserts to test CDC throughput
mongoforge generate \
  --generation-schema ./schemas/users/generation.schema.json \
  --constraints ./schemas/users/constraints.json \
  --doc-count 100000 \
  --target-uri mongodb://cdc-source:27017 \
  --target-db myapp \
  --target-collection users \
  --batch-size 1000

# 4. Validate CDC pipeline captured all changes
# (Your validation logic here)
```

---

### Multiple Collections

```bash
# Generate synthetic data for related collections
for collection in users orders products; do
  mongoforge infer \
    --source-uri mongodb://prod:27017 \
    --source-db myapp \
    --source-collection $collection \
    --output-dir ./schemas/$collection

  mongoforge generate \
    --generation-schema ./schemas/$collection/generation.schema.json \
    --constraints ./schemas/$collection/constraints.json \
    --doc-count 100000 \
    --target-uri mongodb://test:27017 \
    --target-db myapp_test \
    --target-collection $collection
done
```

**Note**: V1 does not maintain referential integrity across collections (e.g., foreign keys). Each collection is generated independently.

---

## Troubleshooting

### Problem: "Insufficient samples" error

```
Error: INSUFFICIENT_SAMPLES
Sample size 50 is too small. Minimum: 100 documents.
```

**Solution**: Increase `--sample-size` to at least 100:

```bash
mongoforge infer \
  --source-uri mongodb://localhost:27017 \
  --source-db mydb \
  --source-collection mycollection \
  --sample-size 500  # Increase this
```

---

### Problem: Generated documents too large/small

**Solution**: Adjust array length policy:

```bash
# Use minmax policy (preserves full range including outliers)
mongoforge infer \
  --source-uri mongodb://localhost:27017 \
  --source-db mydb \
  --source-collection mycollection \
  --array-len-policy minmax

# Or tighten percentile clamping
mongoforge infer \
  --source-uri mongodb://localhost:27017 \
  --source-db mydb \
  --source-collection mycollection \
  --array-len-policy percentileClamp \
  --clamp-range 5,95  # Exclude extreme outliers
```

---

### Problem: MongoDB connection timeout

```
Error: MONGO_CONNECTION_ERROR
Connection timeout after 30s
```

**Solution**: Check MongoDB URI and network access:

```bash
# Test connection with mongo shell first
mongosh mongodb://localhost:27017

# If authentication required, include credentials
mongoforge infer \
  --source-uri "mongodb://user:password@localhost:27017" \
  --source-db mydb \
  --source-collection mycollection
```

---

### Problem: Validation failing (array length deviations)

```
✗ Array length distributions: FAIL
  - user.orders p90: 25 (sample) vs 45 (generated) → 80% deviation
```

**Cause**: Generation schema may have been manually edited or constraints file is stale.

**Solution**: Re-run `mongoforge infer` to regenerate schema and constraints in sync:

```bash
mongoforge infer \
  --source-uri mongodb://localhost:27017 \
  --source-db mydb \
  --source-collection mycollection \
  --sample-size 10000 \
  --output-dir ./schemas  # Overwrites old schemas
```

---

## Next Steps

- **API Documentation**: See `contracts/cli-commands.md` for detailed command reference
- **Data Model**: See `data-model.md` for internal data structure definitions
- **Implementation Plan**: See `plan.md` for technical architecture
- **Research**: See `research.md` for technology decisions and alternatives

---

## Support & Feedback

- GitHub Issues: https://github.com/yourorg/mongoforge/issues
- Documentation: https://github.com/yourorg/mongoforge/wiki

---

**Quickstart Complete**: Users can now sample → generate → validate synthetic MongoDB documents.
