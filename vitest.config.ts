import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: ['node_modules/**', '.next/**'],
        },
        resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
      },
      {
        // React component tests. tsconfig.json sets "jsx": "preserve" for
        // Next's own compiler — vitest runs on esbuild/vite instead, so this
        // project needs its own JSX transform via @vitejs/plugin-react.
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['components/**/*.test.tsx', 'app/**/*.test.tsx'],
          exclude: ['node_modules/**', '.next/**'],
          setupFiles: ['./vitest.setup.ts'],
        },
        resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
      },
    ],
  },
});
