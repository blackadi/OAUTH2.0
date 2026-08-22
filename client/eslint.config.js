import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettier,
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        /**
         * Type-aware linting, which was not switched on.
         *
         * Without `projectService` the parser has no type information, and the rules that need it —
         * `no-floating-promises`, `no-misused-promises`, `no-unsafe-member-access` and the rest of the
         * `no-unsafe-*` family — **cannot run at all**. For most applications that is a style debt. Here
         * the untyped values *are* the subject matter: every response from the authorization server
         * arrives as `unknown` or as an index-signature object, and a forgotten `await` on a token
         * request is exactly the class of bug this codebase has already found four times by hand.
         *
         * `projectService` rather than an explicit `project` array: it resolves each file's tsconfig on
         * demand, so test files and source share one configuration and nothing has to be listed twice.
         */
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        React: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      /**
       * The rules that need type information, enabled deliberately rather than by pulling in a whole
       * preset. A preset would also bring stylistic opinions that would churn the codebase for no
       * safety gain; these four are the ones that catch defects this repo has actually shipped.
       */
      // An unawaited promise in a handler swallows the failure entirely — the request goes out, the
      // rejection is unhandled, and the UI shows nothing. Several sections are one edit away from this.
      '@typescript-eslint/no-floating-promises': 'error',
      // `onClick={async () => …}` on a control whose handler must be synchronous, and `if (promise)`
      // which is always truthy. Both look correct and neither does what it says.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // Reading a property off a value the compiler knows nothing about is how an untyped protocol
      // response becomes a runtime error two components away from where it was parsed.
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // `no-undef` comes from js.configs.recommended and is wrong on TypeScript: it does not know the TS
      // lib types, so `JsonWebKey` and `RequestInit` were reported as undefined globals while `tsc` was
      // perfectly happy with both. typescript-eslint's own guidance is to disable it — TypeScript already
      // performs this check, and does it better. Enumerating each lib type in `globals` would be a
      // never-ending list that silently rots.
      'no-undef': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.*'],
  },
];
