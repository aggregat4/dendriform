module.exports = {
  extends: [
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and eslint-config-prettier. This will display prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
    'plugin:@typescript-eslint/recommended',
  ],
  // we need to ignore this file itself or it will cause eslint problems :facepalm:, see https://stackoverflow.com/questions/63118405/how-to-fix-eslintrc-the-file-does-not-match-your-project-config
  ignorePatterns: ['.eslintrc.js'],
  // I think I need this for the @typescript-eslint rules, but I'm not sure
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
