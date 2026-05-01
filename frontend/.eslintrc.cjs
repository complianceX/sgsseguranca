/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  ignorePatterns: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  extends: ['next/core-web-vitals', 'next/typescript'],
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
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.ts'],
      env: { jest: true },
    },
    {
      files: ['jest.config.cjs', 'scripts/**/*.cjs'],
      env: { node: true },
      parserOptions: { sourceType: 'script' },
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
};

