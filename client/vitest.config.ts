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
    /**
     * The Playwright specs are **not** unit tests and must not be collected here.
     *
     * Vitest's default `include` sweeps up every `.test.` and `.spec.` file in the project, which would
     * catch `e2e/*.spec.ts` — and those import `@playwright/test`, which has no jsdom equivalent, so the
     * whole unit run would fail during collection. Narrowing `include` to `src/` is the fix rather than
     * adding an exclude, because it states the rule positively: unit tests live in `src/`, rendering
     * tests live in `e2e/`, and there is no third place.
     *
     * (The glob is written on the `include` line below rather than quoted in this comment: a `*` followed
     * by a `/` inside a block comment closes it, which is how this file first failed to parse.)
     */
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
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
       * decisions live: `transport.ts` at 100%, `utils/` and `services/` around 80–90%. A section
       * component is mostly markup, and its smoke test asserts that it mounts and offers a control
       * rather than driving every branch.
       */
      thresholds: {
        statements: 80,
        branches: 76,
        functions: 73,
        lines: 81,
        'src/utils/**': { statements: 88, branches: 85, functions: 92, lines: 89 },
        'src/services/**': { statements: 80, branches: 76, functions: 78, lines: 81 },
        /**
         * A floor on the layers the global number could not see.
         *
         * The global ratchet was satisfied at **~5% function coverage of the interactive surface** —
         * `ClientManagementSection` at 1.53%, `AdminSection` at 3.12%, `McpSection` at 3.22% — because a
         * global average cannot distinguish "the logic is covered" from "the buttons are not". That is
         * precisely the surface where the 2026-08-22 sweep found four dead flows behind four green
         * gates, and nothing else asks the question either: `check-route-coverage.mjs` is server-side.
         *
         * They are separate floors rather than one, because they mean different things:
         *
         * - `hooks/` and `context/` hold decisions every section depends on. `useAsyncCall`'s
         *   `describeError` was at **0% branch** while producing the error sentence all 21 sections
         *   render.
         * - `data/` is the teaching corpus. A high floor here is cheap and it means an entry cannot be
         *   added with no assertion about its shape.
         * - `pages/` is `CallbackPage`, the most security-relevant file in the client.
         *
         * - `src/components/**` carried **no floor at all** until P1-12 finished, and the note here said
         *   why: it sat at ~50% functions, `ClientManagementSection` at 1.53%, so any floor would have
         *   been either trivially met or a permanent block. Twenty driven section tests later it
         *   measures **69.73% functions** (470/674) and 77.75% statements, so the floor below is a
         *   reading rather than an aspiration — set a couple of points under, like every other row.
         *
         * **Re-measure before raising any of these; do not carry the numbers forward from memory.**
         */
        'src/hooks/**': { statements: 85, branches: 80, functions: 86, lines: 88 },
        'src/context/**': { statements: 90, branches: 90, functions: 88, lines: 92 },
        'src/data/**': { statements: 94, branches: 100, functions: 84, lines: 94 },
        'src/pages/**': { statements: 82, branches: 80, functions: 80, lines: 82 },
        'src/components/**': { statements: 76, branches: 74, functions: 68, lines: 77 },
      },
    },
  },
});
