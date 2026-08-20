module.exports = {
  env: {'node': true},
  // Node's top-level await needs a parser that understands it, the same way
  // 'code/samples' does.
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    requireConfigFile: false,
    babelOptions: {plugins: ['@babel/plugin-syntax-top-level-await']},
  },
};
