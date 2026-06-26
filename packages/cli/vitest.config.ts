import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.release-bundle.test.ts'],
    // Several test files share real on-disk state under homedir()/.eidola
    // (mcp-awaken signal, workspace registry). Running files in parallel
    // workers races them against each other; keep this package's test files
    // sequential to avoid cross-file flakes.
    fileParallelism: false,
  },
});
