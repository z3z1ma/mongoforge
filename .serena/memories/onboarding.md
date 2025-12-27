# Mongoforge Project Onboarding

## Project Purpose
Schema-driven synthetic MongoDB document generation for high-volume CDC and load testing. It supports schema inference from existing data, generation based on schemas, and validation of documents.

## Tech Stack
- **Language**: TypeScript (Node.js >= 18)
- **CLI Framework**: commander
- **Data Generation**: @faker-js/faker, json-schema-faker
- **MongoDB Tools**: mongodb (driver), mongodb-schema (inference)
- **Validation**: ajv (JSON Schema)
- **Serialization**: ndjson
- **Build/Dev**: tsup, tsx, vitest
- **Style**: Prettier, TypeScript (tsc --noEmit)

## Code Structure
- `src/cli/`: CLI entry point and command definitions (`infer`, `generate`, `validate`, `mutate`).
- `src/lib/`: Core logic modules.
  - `emitter/`: Output handlers (JSON, NDJSON, MongoDB).
  - `generator/`: Data generation logic, including CDC streams.
  - `inferencer/`: Schema inference logic.
  - `normalizer/`: Data normalization.
  - `profiler/`: Schema profiling.
  - `sampler/`: Data sampling.
  - `synthesizer/`: Data synthesis.
  - `validator/`: Document validation.
- `src/types/`: Type definitions.
- `src/utils/`: Shared utilities.
- `tests/`: Unit and integration tests using Vitest.
- `specs/`: Project specifications and plans.

## Development Commands
- **Build**: `npm run build`
- **Development**: `npm run dev` (uses tsx watch)
- **Test**: `npm run test`
- **Coverage**: `npm run test:coverage`
- **Lint**: `npm run lint`
- **Format**: `npm run format`

## Conventions
- Uses ES modules (`"type": "module"`).
- Uses Prettier for formatting.
- Type checking with `tsc --noEmit`.
- Testing with Vitest.
