import { type ConfigContext, type ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "supabase-expo-demo",
  slug: "supabase-expo-demo",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "tech.bradford.supabase-integrity-attest-demo",
    entitlements: {
      "com.apple.developer.devicecheck.appattest-environment": "development",
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-secure-store"],
});
