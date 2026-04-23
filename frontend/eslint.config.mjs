import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.ts'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        global: 'readonly',
      },
    },
  },
  {
    files: ['jest.config.cjs', 'scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXAttribute[name.name=/^(color|backgroundColor|borderColor|outlineColor|fill|stroke|penColor)$/][value.type='Literal'][value.value=/^(#|rgb\\(|rgba\\(|hsl\\(|hsla\\()/i]",
          message:
            'Use tokens do design system em vez de literais de cor em props JSX.',
        },
        {
          selector:
            "JSXAttribute[name.name='style'] JSXExpressionContainer ObjectExpression > Property[key.type='Identifier'][key.name=/^(color|background|backgroundColor|borderColor|outlineColor|fill|stroke)$/][value.type='Literal'][value.value=/^(#|rgb\\(|rgba\\(|hsl\\(|hsla\\()/i]",
          message:
            'Use tokens do design system em vez de literais de cor em style inline.',
        },
      ],
    },
  },
];

export default config;
