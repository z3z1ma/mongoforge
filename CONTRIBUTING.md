# Contributing to MongoForge

Thank you for your interest in contributing to MongoForge! This document provides guidelines for development, testing, and submitting contributions.

## Development Setup

### Prerequisites

- **Node.js**: 18.x or later
- **MongoDB**: 4.0+ (for integration tests)
- **Git**: For version control

### Installation

```bash
# Clone the repository
git clone https://github.com/yourorg/mongoforge.git
cd mongoforge

# Install dependencies
npm install

# Run tests to verify setup
npm test
```

## Development Workflow

### Project Structure

```
mongoforge/
├── src/
│   ├── lib/          # Core library modules
│   ├── cli/          # CLI interface
│   ├── types/        # Shared TypeScript types
│   └── utils/        # Shared utilities
├── tests/
│   ├── unit/         # Unit tests
│   ├── integration/  # Integration tests
│   └── contract/     # CLI contract tests
├── specs/            # Feature specifications and documentation
└── dist/             # Build output (gitignored)
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test -- --watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run specific test file
npm test tests/unit/sampler/strategies.test.ts
```

### Building

```bash
# Build for production (ESM + CJS)
npm run build

# Type check without emitting
npm run lint

# Format code with Prettier
npm run format
```

### Development Mode

```bash
# Run CLI in development mode (hot reload)
npm run dev -- infer --help
npm run dev -- generate --help
npm run dev -- validate --help
```

## Code Standards

### TypeScript

- **Strict Mode**: All code must compile with TypeScript strict mode
- **Type Safety**: Avoid `any` types; use proper type annotations
- **Naming**: Use camelCase for variables/functions, PascalCase for types/interfaces
- **Exports**: Prefer named exports over default exports

### Testing

- **Coverage**: Maintain >80% test coverage for new code
- **Test Patterns**:
  - Unit tests: Test individual functions/modules in isolation
  - Integration tests: Test end-to-end workflows with MongoDB
  - Contract tests: Test CLI command interfaces and output formats
- **Test Organization**: Mirror `src/` structure in `tests/unit/`

### Code Style

Code style is enforced by Prettier. Configuration is in `package.json`:

```bash
# Check formatting
npx prettier --check "src/**/*.ts"

# Auto-fix formatting
npm run format
```

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Write Code

- Follow the TypeScript and testing standards above
- Add unit tests for new functionality
- Update integration tests if changing workflows
- Update documentation if changing CLI interfaces

### 3. Run Quality Checks

```bash
# Type check
npm run lint

# Run tests
npm test

# Check coverage
npm run test:coverage

# Format code
npm run format

# Build to verify
npm run build
```

### 4. Commit Changes

Use conventional commit format:

```bash
git commit -m "feat: add custom generator for UUIDs"
git commit -m "fix: resolve backpressure handling in MongoDB writer"
git commit -m "docs: update README with new examples"
git commit -m "test: add integration test for validation workflow"
```

Commit types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions/changes
- `refactor`: Code restructuring without behavior change
- `perf`: Performance improvements
- `chore`: Build/tooling changes

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub with:
- Clear description of changes
- Reference to related issues (if any)
- Test results
- Breaking changes (if any)

## Pull Request Guidelines

### PR Checklist

Before submitting, ensure:

- [ ] Code compiles (`npm run lint` passes)
- [ ] All tests pass (`npm test` passes)
- [ ] Test coverage is >80% (`npm run test:coverage`)
- [ ] Code is formatted (`npm run format`)
- [ ] Documentation is updated (README, CLI help, etc.)
- [ ] CHANGELOG.md is updated (for notable changes)
- [ ] Commit messages follow conventional format

### PR Description

Include:

1. **What**: What changes were made
2. **Why**: Why these changes are needed
3. **How**: How the changes were implemented
4. **Testing**: What tests were added/modified
5. **Breaking Changes**: Any API or behavior changes (if applicable)

Example:

```markdown
## What
Adds support for custom field generators with path-based overrides.

## Why
Users need to override default generation for specific fields (e.g., email, UUID).

## How
- Implemented custom generator registration API in `custom-formats.ts`
- Added precedence logic: path > type > default
- Created integration tests for override behavior

## Testing
- Added unit tests for registration API
- Added integration test `custom-generators.test.ts`
- All existing tests pass

## Breaking Changes
None
```

## Issue Guidelines

### Reporting Bugs

Include:

- **Description**: Clear description of the bug
- **Steps to Reproduce**: Exact steps to trigger the issue
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: OS, Node.js version, MongoDB version
- **Logs**: Error messages and stack traces

### Feature Requests

Include:

- **Use Case**: What problem does this solve
- **Proposed Solution**: How should it work
- **Alternatives**: Other solutions considered
- **Examples**: Example usage or CLI commands

## Testing MongoDB Integration

Integration tests require a running MongoDB instance. We use `mongodb-memory-server` for isolated testing:

```typescript
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
});

afterAll(async () => {
  await mongod.stop();
});
```

For manual testing with a real MongoDB instance:

```bash
# Start MongoDB (Docker)
docker run -d -p 27017:27017 --name mongo-test mongo:7

# Run integration tests
npm test

# Stop MongoDB
docker stop mongo-test && docker rm mongo-test
```

## Debugging

### Enable Debug Logging

```bash
# Set LOG_LEVEL environment variable
LOG_LEVEL=debug npm run dev -- generate --help
```

### Debug Tests with VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Current Test",
  "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/vitest",
  "runtimeArgs": ["--inspect-brk", "--no-file-parallelism", "${file}"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update `CHANGELOG.md` with release notes
3. Commit: `git commit -m "chore: release v0.2.0"`
4. Tag: `git tag v0.2.0`
5. Push: `git push && git push --tags`
6. Publish: `npm publish`
7. Create GitHub release with changelog

## Questions?

- Open an issue for questions
- Check existing issues and PRs first
- Reference documentation in `specs/` directory

Thank you for contributing to MongoForge!
