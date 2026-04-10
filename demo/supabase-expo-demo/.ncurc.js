/** @type {import('npm-check-updates').RcOptions } */
module.exports = {
  target: (name) => {
    if (name === 'expo') return 'minor'
    return 'latest'
  },
  reject: ['@types/react', 'react', 'react-native', 'expo-status-bar'],
}
