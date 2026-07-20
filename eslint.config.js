import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.config.{js,cjs,mjs,ts}',
      '**/vite-env.d.ts',
      'scripts/**',
      'supabase/**',
      'packages/supabase/src/types.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // shadcn/ui primitives are vendored verbatim — relax the noisiest rules.
    files: ['**/components/ui/**'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    // Build-time Node scripts (e.g. apps/web/scripts/prerender.mjs) run in Node, not the browser.
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, fetch: 'readonly' },
    },
  },
);
