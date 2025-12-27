# API Contracts: CLI Commands

**Feature**: `003-cdc-mutation-mode`

## 1. Command: `mutate`

**Description**: Perform mutations on an existing collection.

### Arguments

| Argument | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `[schema]` | Path to JSON schema file (required for `regenerate` strategy) | No | - |

### Options

| Option | Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| URI | `--uri <string>` | string | - | MongoDB connection URI (required) |
| Database | `--db <string>` | string | - | Target database name (overrides URI) |
| Collection | `--collection <string>` | string | - | Target collection name (required) |
| Ratio | `--ratio <string>` | string | `update:100` | Op ratios (e.g. `update:80,delete:20`) |
| Count | `-n, --count <number>` | number | Infinity | Total operations to perform |
| Rate Limit | `--rate-limit <number>` | number | - | Max ops/second |
| Strategy | `--update-strategy <type>` | string | `regenerate` | `regenerate`, `partial`, `increment` |
| Delete Track | `--delete-tracking <type>` | string | `none` | `none`, `memory`, `filter` |

## 2. Command: `generate` (Extension)

**Description**: Extended to support `mongo-cdc` output.

### New Options (valid when `--output mongo-cdc`)

| Option | Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| CDC Ratios | `--operation-ratios <string>` | string | `insert:100` | e.g. `insert:50,update:40,delete:10` |
| Cache Size | `--id-cache-size <number>` | number | 10000 | Max IDs to hold in memory for targeting |
| Warmup | `--warmup-inserts <number>` | number | 0 | Initial inserts before mixing ops |
| Delete Behavior | `--delete-behavior <type>` | string | `remove` | `remove`, `keep`, `tombstone` |
