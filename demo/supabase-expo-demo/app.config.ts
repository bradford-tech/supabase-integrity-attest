import { type ConfigContext, type ExpoConfig } from "expo/config";

// Per-developer env vars — each developer sets their own Apple Team ID
// and bundle identifier in .env.local. See .env.example for instructions.
const teamId = process.env.EXPO_PUBLIC_TEAM_ID ?? "";
const bundleIdentifier =
  process.env.EXPO_PUBLIC_BUNDLE_IDENTIFIER ??
  "tech.bradford.supabase-integrity-attest-demo";

// APP_ID = "TEAMID.bundleIdentifier" — the format Apple App Attest uses
// for rpIdHash verification. The server reads the same value from its own
// APP_ID env var. Both must match or verifyAttestation / verifyAssertion
// will reject with RP_ID_MISMATCH.
const appId = teamId ? `${teamId}.${bundleIdentifier}` : "";

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
    bundleIdentifier,
    ...(teamId ? { teamId } : {}),
    entitlements: {
      "com.apple.developer.devicecheck.appattest-environment": "development",
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-secure-store"],
  extra: {
    // Derived APP_ID exposed to client code via expo-constants:
    //   import Constants from 'expo-constants'
    //   Constants.expoConfig?.extra?.appId
    appId,
  },
});
