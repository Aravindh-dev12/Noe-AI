import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['packages/db/prisma.config.ts', 'packages/db/prisma/seed.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // These persistence-boundary modules intentionally bridge validated domain
    // objects into Prisma JSON inputs and strip integrity-only fields before
    // recomputing semantic digests. TypeScript still checks the underlying
    // assignments; this narrowly avoids lint false positives at those edges.
    files: [
      'packages/db/src/consequence-reception.ts',
      'packages/db/src/reliance-provenance.ts',
    ],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    files: ['packages/db/src/reliance-provenance.ts'],
    rules: {
      // `_id`/`_digest` are deliberate object-rest omissions used to recompute
      // semantic digests without self-referential integrity fields.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // Invalid stored JSON is rendered only for a diagnostic conflict message;
      // it is never accepted as a structural-change value.
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
);
