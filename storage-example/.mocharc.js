module.exports = {
  diff: true,
  extension: ['js'],
  recursive: true,
  opts: './test/mocha.opts',
  package: './package.json',
  reporter: 'spec',
  spec: './test/**/*-test.js',
  slow: 75,
  // require: './test/mocha-require.js',
  timeout: 2000,
  ui: 'bdd'
};
