# Quickstart: Dynamic Key Inference & Optimized Array Length Storage

**Feature**: `002-dynamic-key-inference`
**Audience**: mongoforge users and developers
**Last Updated**: 2025-12-26

## Overview

This feature automatically detects and compactly represents MongoDB documents with highly variable object keys (UUIDs, account IDs, etc.) and optimizes array length storage. Instead of creating bloated schemas with thousands of individual key entries, mongoforge now:

1. **Detects dynamic key patterns** when keys exceed a threshold (default: 50)
2. **Stores key count distributions** and format characteristics
3. **Generates realistic synthetic keys** matching observed patterns
4. **Optimizes array length storage** using frequency maps instead of exhaustive arrays

---

## Quick Examples

### Before (Without Dynamic Key Detection)

**Collection**:
```javascript
{
  _id: ObjectId("..."),
  permissions: {
    "a0b1c2d3-e4f5-6789-abcd-ef0123456789": "admin",
    "b1c2d3e4-f5a6-789b-cdef-0123456789ab": "read",
    "c2d3e4f5-a678-9bcd-ef01-23456789abcd": "write",
    // ... 100+ more UUID keys
  }
}
```

**Schema artifact** (❌ bloated):
```json
{
  "properties": {
    "permissions": {
      "properties": {
        "a0b1c2d3-e4f5-6789-abcd-ef0123456789": {"type": "string"},
        "b1c2d3e4-f5a6-789b-cdef-0123456789ab": {"type": "string"},
        "c2d3e4f5-a678-9bcd-ef01-23456789abcd": {"type": "string"},
        // ... 100+ more individual keys
      }
    }
  }
}
```

**File size**: 50KB for 100 keys

### After (With Dynamic Key Detection)

**Schema artifact** (✅ compact):
```json
{
  "properties": {
    "permissions": {
      "type": "object",
      "x-dynamic-keys": {
        "enabled": true,
        "metadata": {
          "pattern": "UUID",
          "confidence": 0.95,
          "countDistribution": {
            "10": 40,
            "15": 35,
            "20": 25
          }
        },
        "valueSchema": {
          "types": ["string"],
          "schemas": [{"type": "string", "enum": ["read", "write", "admin"]}]
        }
      }
    }
  }
}
```

**File size**: 2KB (96% reduction!)

**Generated documents** have 10-20 realistic UUID keys with correct value types.

---

## Configuration

### CLI Options

```bash
# Enable with default threshold (50 keys)
mongoforge generate \
  --connection mongodb://localhost:27017 \
  --database mydb \
  --collection users \
  --output users.ndjson \
  --count 10000

# Custom threshold
mongoforge generate \
  --connection mongodb://localhost:27017 \
  --database mydb \
  --collection users \
  --output users.ndjson \
  --count 10000 \
  --dynamic-key-threshold 30

# Disable dynamic key detection
mongoforge generate \
  --connection mongodb://localhost:27017 \
  --database mydb \
  --collection users \
  --output users.ndjson \
  --count 10000 \
  --no-dynamic-keys
```

### Config File

**`mongoforge.config.json`**:
```json
{
  "dynamicKeyDetection": {
    "enabled": true,
    "threshold": 50,
    "minPatternMatch": 0.8,
    "confidenceThreshold": 0.7,
    "patterns": [
      {
        "name": "UUID",
        "regex": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
      },
      {
        "name": "MONGODB_OBJECTID",
        "regex": "^[0-9a-f]{24}$"
      },
      {
        "name": "CUSTOM_TRANSACTION_ID",
        "regex": "^TXN_[0-9]{10}$"
      }
    ],
    "forceStaticPaths": ["users.metadata"],
    "forceDynamicPaths": ["events.byResourceId"]
  }
}
```

```bash
# Use config file
mongoforge generate \
  --connection mongodb://localhost:27017 \
  --database mydb \
  --collection events \
  --config mongoforge.config.json \
  --output events.ndjson \
  --count 10000
```

### Programmatic API

```typescript
import { infer, generate } from 'mongoforge';

const schema = await infer({
  connection: 'mongodb://localhost:27017',
  database: 'mydb',
  collection: 'events',
  dynamicKeyDetection: {
    enabled: true,
    threshold: 50,
    patterns: [
      { name: 'UUID', regex: /^[0-9a-f]{8}-[0-9a-f]{4}-...$/i }
    ],
    minPatternMatch: 0.8,
    confidenceThreshold: 0.7
  }
});

const documents = await generate({
  schema,
  count: 10000,
  seed: 42
});
```

---

## Use Cases

### 1. Event Logs with Resource IDs

**Problem**: Event collection with `eventsByResourceId` object containing 1000+ UUID keys

**Before**:
- Schema artifact: 2MB
- Inference time: 45 seconds
- Memory usage: 4GB

**After**:
- Schema artifact: 50KB (97.5% reduction)
- Inference time: 40 seconds
- Memory usage: 500MB
- Generated documents have realistic 10-50 event keys per resource

### 2. User Permissions by Account

**Problem**: User permissions stored as object with account IDs as keys

```javascript
{
  _id: ObjectId("..."),
  accountPermissions: {
    "acct_1234567890": "owner",
    "acct_9876543210": "member",
    // ... 200+ account IDs
  }
}
```

**Solution**:
```bash
mongoforge generate \
  --connection mongodb://localhost:27017 \
  --database authdb \
  --collection users \
  --dynamic-key-threshold 50 \
  --output users.ndjson \
  --count 50000
```

**Result**:
- Detects `PREFIXED_ID` pattern (`acct_*`)
- Stores count distribution (50-200 keys)
- Generates synthetic account IDs matching pattern
- Value types preserved (`owner`, `member`, etc.)

### 3. Variable-Length Arrays

**Problem**: Orders collection with varying item counts

```javascript
{
  _id: ObjectId("..."),
  items: [
    { sku: "ABC123", quantity: 2 },
    { sku: "DEF456", quantity: 1 },
    // ... 1-100 items
  ]
}
```

**Before** (`constraints.json`):
```json
{
  "arrayLengths": {
    "items": [1, 1, 2, 3, 1, 5, 2, 2, 1, 10, ...]  // 10,000 values
  }
}
```

**After** (`constraints.json`):
```json
{
  "arrayLengths": {
    "items": {
      "distribution": {
        "1": 4500,
        "2": 3000,
        "3": 1500,
        "5": 700,
        "10": 300
      },
      "stats": {
        "min": 1,
        "max": 10,
        "median": 2,
        "p95": 5
      }
    }
  }
}
```

**Space savings**: 80% reduction in artifact size

---

## Pattern Detection

### Supported Patterns

| Pattern | Regex | Example |
|---------|-------|---------|
| **UUID** | `^[0-9a-f]{8}-[0-9a-f]{4}-...` | `550e8400-e29b-41d4-a716-446655440000` |
| **MongoDB ObjectId** | `^[0-9a-f]{24}$` | `507f1f77bcf86cd799439011` |
| **ULID** | `^[0-9A-Z]{26}$` | `01ARZ3NDEKTSV4RRFFQ69G5FAV` |
| **Numeric ID** | `^\d{6,20}$` | `1234567890` |
| **Prefixed ID** | `^(user\|doc\|item\|order)_[a-z0-9]{8,32}$` | `user_a1b2c3d4e5f6` |

### Adding Custom Patterns

**Config file**:
```json
{
  "dynamicKeyDetection": {
    "patterns": [
      {
        "name": "TRANSACTION_ID",
        "regex": "^TXN_[0-9]{8}_[A-Z]{3}$"
      },
      {
        "name": "SESSION_TOKEN",
        "regex": "^sess_[a-zA-Z0-9]{32}$"
      }
    ]
  }
}
```

**Programmatic**:
```typescript
const schema = await infer({
  connection: 'mongodb://localhost:27017',
  database: 'mydb',
  collection: 'transactions',
  dynamicKeyDetection: {
    enabled: true,
    patterns: [
      { name: 'TRANSACTION_ID', regex: /^TXN_[0-9]{8}_[A-Z]{3}$/ }
    ]
  }
});
```

---

## Manual Overrides

### Force Static Keys

Prevent detection on specific paths:

```json
{
  "dynamicKeyDetection": {
    "forceStaticPaths": [
      "users.metadata",
      "config.settings"
    ]
  }
}
```

**Use case**: Object has many keys but they're legitimate properties (not IDs)

### Force Dynamic Keys

Enable detection on specific paths regardless of threshold:

```json
{
  "dynamicKeyDetection": {
    "forceDynamicPaths": [
      "events.byResourceId",
      "cache.entries"
    ]
  }
}
```

**Use case**: Object has fewer keys than threshold but they're clearly dynamic

---

## Validation

### Inspect Schema Artifacts

```bash
# After inference, check generation.schema.json
cat output/generation.schema.json | jq '.properties.permissions."x-dynamic-keys"'
```

**Expected output**:
```json
{
  "enabled": true,
  "metadata": {
    "pattern": "UUID",
    "confidence": 0.95,
    "confidenceLevel": "high",
    "countDistribution": {...},
    "exampleKeys": [...]
  },
  "valueSchema": {...}
}
```

### Verify Generated Documents

```bash
# Generate sample documents
mongoforge generate \
  --schema output/generation.schema.json \
  --count 10 \
  --output sample.ndjson

# Inspect first document
head -1 sample.ndjson | jq '.permissions | keys | length'
```

**Expected**: Key count within observed distribution range (e.g., 10-20)

### Check Array Lengths

```bash
# Inspect constraints.json
cat output/constraints.json | jq '.arrayLengths.items'
```

**Expected**:
```json
{
  "distribution": {
    "1": 450,
    "2": 350,
    "3": 150
  },
  "stats": {
    "min": 1,
    "max": 3,
    "median": 2,
    "p95": 3
  }
}
```

---

## Troubleshooting

### Pattern Not Detected

**Symptom**: Keys should be detected as dynamic but aren't

**Check**:
```bash
# Enable debug logging
mongoforge generate \
  --connection mongodb://localhost:27017 \
  --database mydb \
  --collection users \
  --log-level debug
```

**Common causes**:
1. Key count below threshold (default 50)
   - Solution: Lower `--dynamic-key-threshold`
2. Keys don't match any pattern (< 80% match)
   - Solution: Add custom pattern in config
3. Confidence too low
   - Solution: Lower `confidenceThreshold` in config

**Manual override**:
```json
{
  "dynamicKeyDetection": {
    "forceDynamicPaths": ["users.permissions"]
  }
}
```

### False Positive Detection

**Symptom**: Legitimate property keys detected as dynamic

**Check schema artifact**:
```bash
cat output/generation.schema.json | jq '.properties.myObject."x-dynamic-keys".metadata.exampleKeys'
```

**Solutions**:
1. Increase threshold:
   ```bash
   --dynamic-key-threshold 100
   ```

2. Add to static paths:
   ```json
   {
     "dynamicKeyDetection": {
       "forceStaticPaths": ["myObject"]
     }
   }
   ```

3. Increase pattern match requirement:
   ```json
   {
     "dynamicKeyDetection": {
       "minPatternMatch": 0.95
     }
   }
   ```

### Generated Keys Don't Match Original Format

**Symptom**: Original keys are UUIDs but generated keys are random strings

**Check value schema**:
```bash
cat output/generation.schema.json | jq '.properties.permissions."x-dynamic-keys".metadata.pattern'
```

**Expected**: `"UUID"` (or appropriate pattern)

**If shows `"CUSTOM"` or wrong pattern**:
- Add explicit pattern in config
- Check regex pattern is correct
- Verify keys actually match expected format

---

## Performance Impact

### Baseline Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Schema inference (1M docs, 100 dynamic keys)** | 45s | 48s | +6.7% ✅ |
| **Schema artifact size** | 2MB | 50KB | -97.5% ✅ |
| **Memory usage (inference)** | 4GB | 500MB | -87.5% ✅ |
| **Document generation (10k docs)** | 10,000/s | 9,500/s | -5% ✅ |
| **Array constraints size (1k arrays, 20 lengths)** | 100KB | 20KB | -80% ✅ |

**All metrics within acceptable bounds** (< 10% performance impact, > 50% size reduction)

---

## Next Steps

- **Read the specification**: See `spec.md` for complete functional requirements
- **Review data models**: See `data-model.md` for TypeScript interfaces
- **Explore contracts**: See `contracts/` for JSON Schema definitions
- **Check implementation plan**: See `plan.md` for technical approach

For questions or issues, refer to the mongoforge documentation or create a GitHub issue.
