/** @type {import('npm-check-updates').RcOptions } */
module.exports = {
  target: (name) => {
    if (name === "expo") return "minor";
    return "latest";
  },
  reject: [
    // Expo-managed — use `npx expo install --fix`
    /^expo-/,
    /^@expo\//,
    "@types/react",
    "eslint-config-expo",
    "react",
    "react-native",
    "react-native-safe-area-context",
  ],
};
