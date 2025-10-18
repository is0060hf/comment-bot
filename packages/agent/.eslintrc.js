module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // Agent specific rules
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  },
};
