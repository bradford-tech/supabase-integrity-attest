// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const { includeIgnoreFile } = require("@eslint/compat");
const path = require("node:path");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

const gitignorePath = path.resolve(__dirname, ".gitignore");

module.exports = defineConfig([
  includeIgnoreFile(gitignorePath),
  { ignores: ["supabase/", "eslint.config.js"] },
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-deprecated": "warn",
    },
  },
]);
