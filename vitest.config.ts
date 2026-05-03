import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}', 'convex/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/hooks/useRider*.ts',
        'src/components/Rider*.tsx',
        'src/components/CustomerRiderPanel.tsx',
        'src/components/ProtectedRiderRoute.tsx',
        'convex/riders.ts',
        'convex/riderActions.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
