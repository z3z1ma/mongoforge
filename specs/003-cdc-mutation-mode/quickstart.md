# Quickstart: CDC and Mutation

This feature adds two new ways to drive load against MongoDB: `mutate` (for existing data) and `generate --output mongo-cdc` (for mixed workloads).

## 1. Mutation Mode (Existing Data)

Run a stream of updates and deletes against a collection that already has data.

```bash
# Basic mutation: 70% updates, 30% deletes
mongoforge mutate \
  --uri "mongodb://localhost:27017/testdb" \
  --collection "users" \
  --schema "./schemas/user.json" \
  --ratio "update:70,delete:30" \
  --rate-limit 100
```

### Options

- `--count <n>`: Stop after N operations.
- `--delete-tracking memory`: Ensure we don't try to delete the same ID twice.
- `--update-strategy partial`: Only update a few fields instead of regenerating the whole doc.

## 2. CDC Mode (Traffic Generation)

Simulate a live application by inserting, updating, and deleting simultaneously.

```bash
# CDC simulation: 50% inserts, 40% updates, 10% deletes
mongoforge generate \
  --schema "./schemas/user.json" \
  --output mongo-cdc \
  --uri "mongodb://localhost:27017/testdb" \
  --collection "users" \
  --operation-ratios "insert:50,update:40,delete:10" \
  --id-cache-size 50000 \
  --rate-limit 500
```

### Key Flags

- `--warmup-inserts 1000`: Insert 1000 docs before starting the mix (populates cache).
- `--delete-behavior tombstone`: Keep deleted IDs in cache (simulate soft deletes or race conditions).

```