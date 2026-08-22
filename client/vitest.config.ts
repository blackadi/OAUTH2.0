import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.d.ts', 'src/main.tsx', 'src/**/*.generated.ts'],
      /**
       * A ratchet, not a target.
       *
       * The numbers are set just under what the suite currently achieves, so coverage can only go up:
       * a change that drops it fails the build, and raising the floor after an improvement is a
       * deliberate act. That is the same shape as `scripts/route-coverage-baseline.json` on the server —
       * carry the debt visibly and shrink it, rather than picking an aspirational number nobody meets
       * and disabling the check six weeks later.
       *
       * The logic layer is held to a much higher bar than the components, because that is where the
       * decisions live: `transport.ts` at 100%, `utils/` at 95%. A section component is mostly markup,
       * and its smoke test asserts that it mounts and offers a control rather than driving every branch.
       */
      thresholds: {
        statements: 57,
        branches: 53,
        functions: 45,
        lines: 59,
        'src/utils/**': { statements: 90, branches: 80, functions: 95, lines: 90 },
        'src/services/**': { statements: 75, branches: 70, functions: 70, lines: 75 },
      },
    },
  },
});
