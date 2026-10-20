import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Note: .tsx tests that need a DOM should use `// @vitest-environment jsdom` at the top of the file.
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
