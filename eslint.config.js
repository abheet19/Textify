export default [
  {
    files: ["app/web/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        AbortController: "readonly",
        document: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        localStorage: "readonly",
        Option: "readonly",
        sessionStorage: "readonly",
        window: "readonly",
        confirm: "readonly",
      },
    },
    rules: {
      eqeqeq: "error",
      "no-constant-binary-expression": "error",
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["tools/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        axe: "readonly",
        Buffer: "readonly",
        console: "readonly",
        CSS: "readonly",
        document: "readonly",
        innerWidth: "readonly",
        localStorage: "readonly",
        process: "readonly",
        Response: "readonly",
        sessionStorage: "readonly",
        URL: "readonly",
        window: "readonly",
      },
    },
    rules: {
      eqeqeq: "error",
      "no-constant-binary-expression": "error",
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
