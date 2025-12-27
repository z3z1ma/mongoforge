# Suggested Commands

## Running the CLI
- `npm run dev -- <command> [options]`
- `node dist/cli.js <command> [options]` (after build)

## Common Workflow
1. `npm run dev -- infer --uri <uri> --db <db> --collection <coll> --output schema.json`
2. `npm run dev -- generate --schema schema.json --count 1000 --output data.ndjson`
3. `npm run dev -- validate --schema schema.json --input data.ndjson`

## Quality Gates
- `npm run lint`
- `npm run format`
- `npm run test`
