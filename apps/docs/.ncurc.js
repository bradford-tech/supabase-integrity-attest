/** @type {import('npm-check-updates').RcOptions } */
module.exports = {
  target: (name) => {
    if (name === '@types/node') return 'minor'
    if (name === 'eslint') return 'minor'
    return 'latest'
  },
}
