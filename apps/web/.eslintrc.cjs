/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  // Third-party React Bits source and its compiled output (see vendor/react-bits/README.md).
  ignorePatterns: ['vendor/**', 'src/components/react-bits/**'],
  extends: ['next/core-web-vitals', require.resolve('@fomeora/eslint-config')]
};
