import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // plugin-react gives the same JSX/transform behavior as the build for .tsx tests.
  plugins: [react()],
  test: {
    // Default stays 'node' so existing service tests are unaffected.
    // Component/page tests opt into jsdom per-file via `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
