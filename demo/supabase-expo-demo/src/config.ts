// src/config.ts
//
// Central configuration for the demo app. All values are read from
// Expo env vars (EXPO_PUBLIC_*) which Metro inlines at bundle time.

/**
 * Base URL of the Supabase instance. On physical devices, this must be
 * the host machine's LAN IP (e.g., http://192.168.1.42:54321) because
 * the iPhone can't reach 127.0.0.1. In the simulator, localhost works.
 *
 * Set via EXPO_PUBLIC_SUPABASE_URL in .env.local.
 */
export const SUPABASE_URL: string =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'

/** Edge functions base URL derived from SUPABASE_URL. */
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
