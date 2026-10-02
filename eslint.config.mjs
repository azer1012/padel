// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "lib/api-client-react/src/generated/**",
      "artifacts/padel-club/public/sw.js",
      "**/*.tsbuildinfo",
      // Local AI/editor tooling: some keep full copies of the repository (worktrees)
      ".agents/**",
      ".kilo/**",
      ".qodo/**",
      ".local/**",
      ".config/**",
      "artifacts/mockup-sandbox/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // The API boundary uses loosely typed request bodies on purpose (validated by hand)
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["artifacts/padel-club/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // CLI scripts print to the terminal by design
    files: ["scripts/**/*.{ts,mjs}"],
    rules: { "no-console": "off" },
  },
);
