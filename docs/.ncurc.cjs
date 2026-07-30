/** @type {import('npm-check-updates').RcOptions } */
module.exports = {
  target: (name) => {
    if (name === '@types/node') return 'minor'
    if (name === 'eslint') return 'minor'
    // @markdoc/next.js's loader emits `import yaml from 'js-yaml'`;
    // js-yaml 5 removed the default export — blocked until upstream fixes
    if (name === 'js-yaml') return 'minor'
    return 'latest'
  },
  reject: ['react', 'react-dom'],
}
