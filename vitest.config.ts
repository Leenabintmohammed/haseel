import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsConfigPaths()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: [],
    include: ['**/*.{spec,test}.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts', 'node_modules'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
