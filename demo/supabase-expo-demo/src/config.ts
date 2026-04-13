// src/config.ts
//
// Central configuration for the demo app. All values are read from
// Expo env vars (EXPO_PUBLIC_*) which Metro inlines at bundle time,
// or from expo-constants (for values derived in app.config.ts).
import Constants from "expo-constants";

/**
 * Base URL of the Supabase instance. On physical devices, this must be
 * the host machine's LAN IP (e.g., http://192.168.1.42:54321) because
 * the iPhone can't reach 127.0.0.1. In the simulator, localhost works.
 *
 * Set via EXPO_PUBLIC_SUPABASE_URL in .env.local.
 */
export const SUPABASE_URL: string =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";

/** Edge functions base URL derived from SUPABASE_URL. */
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/**
 * APP_ID in the "TEAMID.bundleIdentifier" format. Derived in
 * app.config.ts from EXPO_PUBLIC_TEAM_ID + EXPO_PUBLIC_BUNDLE_IDENTIFIER
 * and exposed via expo-constants. Empty string if TEAM_ID is not set
 * (simulator / unconfigured — the graceful degradation banner handles this).
 *
 * The server reads the same value from its APP_ID env var. Both must
 * match or App Attest verification rejects with RP_ID_MISMATCH.
 */
export const APP_ID: string =
  (Constants.expoConfig?.extra?.appId as string) ?? "";
