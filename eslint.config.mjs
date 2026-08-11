import eslint from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["apps/api/src/common/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/modules/**"],
              message:
                "Common infrastructure must not import application modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/anti-abuse/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["../auth/**", "../guest-access/**", "../check-in-api/**"],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/auth/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["../guest-access/**", "../check-in-api/**"] },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/guest-access/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["../check-in-api/**"] }],
    },
  },
  {
    files: ["apps/api/src/modules/check-in-api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["../guest-access/**", "../anti-abuse/**"] },
      ],
    },
  },
  {
    files: ["apps/{valet,customer,dashboard}/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
  },
);
