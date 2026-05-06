import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name=/^(color|backgroundColor|borderColor|outlineColor|fill|stroke|penColor)$/][value.type='Literal'][value.value=/^(#|rgb\\(|rgba\\(|hsl\\(|hsla\\()/i]",
          message:
            "Use tokens do design system em vez de literais de cor em props JSX.",
        },
        {
          selector:
            "JSXAttribute[name.name='style'] JSXExpressionContainer ObjectExpression > Property[key.type='Identifier'][key.name=/^(color|background|backgroundColor|borderColor|outlineColor|fill|stroke)$/][value.type='Literal'][value.value=/^(#|rgb\\(|rgba\\(|hsl\\(|hsla\\()/i]",
          message:
            "Use tokens do design system em vez de literais de cor em style inline.",
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "jest.setup.ts"],
    languageOptions: {
      globals: globals.jest,
    },
  },
  {
    files: ["jest.config.cjs", "scripts/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.commonjs,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
