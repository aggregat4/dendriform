module.exports = {
  extends: [
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and eslint-config-prettier. This will display prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  rules: {
    'prettier/prettier': ['error'],
    '@typescript-eslint/no-floating-promises': ['error'],
    '@typescript-eslint/no-extra-semi': 'off',
  },
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
    ecmaVersion: '2018',
  },
  plugins: ['prettier', '@typescript-eslint'],
}
