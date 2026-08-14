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
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
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
