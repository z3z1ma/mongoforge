import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        'vitest.config.ts',
        'tsup.config.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 70,
        branches: 70,
        statements: 60,
      },
    },
    testMatch: ['**/*.test.ts', '**/*.spec.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
