/** @type {import('npm-check-updates').RcOptions } */
module.exports = {
  target: (name) => {
    if (name === 'typescript') return 'minor'
    return 'latest'
  },
}
