# App Attest Demo

End-to-end demo of [@bradford-tech/supabase-integrity-attest](https://integrity-attest.bradford.tech) — Apple App Attest verification on Supabase Edge Functions, exercised from an Expo iOS app on a physical iPhone.

**Requirements:** macOS, Docker, Xcode, a physical iPhone (App Attest requires Secure Enclave hardware — the iOS simulator cannot be used for the attestation/assertion flows).

## Setup

### 1. Get your Apple Team ID

Go to [Apple Developer Account > Membership](https://developer.apple.com/account) and copy your **Team ID** (10-character alphanumeric string, e.g., `ABC123DEF4`).

### 2. Choose a bundle identifier

Pick a reverse-DNS bundle identifier for the demo app. This can be anything you own — it just needs to be unique in the Apple Developer portal.

**Example:** `com.yourcompany.appattest-demo`

The convention is your reversed domain name followed by a project-specific suffix. Use only lowercase letters, numbers, hyphens, and dots.

### 3. Register an App ID with App Attest enabled

**This is the single most important step.** Without it, attestation will fail with `RP_ID_MISMATCH` and there is no workaround.

1. Go to [Certificates, Identifiers & Profiles > Identifiers](https://developer.apple.com/account/resources/identifiers/list/bundleId)
2. Click the **+** button (top left) to register a new identifier
3. Select **App IDs** and click **Continue**
4. Select **App** (not App Clip) and click **Continue**
5. Fill in the registration form:
   - **Description:** A human-readable name (e.g., `App Attest Demo`)
   - **Bundle ID:** Select **Explicit** and enter the identifier from step 2 (e.g., `com.yourcompany.appattest-demo`)
6. Scroll down to the **Capabilities** section and check the **App Attest** checkbox
7. Click **Continue**, then **Register**

> **App Attest must be explicitly checked.** Simply having an App ID is not sufficient — the App Attest capability must be ticked on. If you skip this, the attestation flow will fail with `RP_ID_MISMATCH` at runtime and there is no workaround other than going back and enabling it.

> Expo's `expo run:ios` handles code signing and provisioning profiles automatically — you do not need to open Xcode manually. On first build, Expo will prompt you to select your Apple team and will configure signing for you.

### 4. Configure the Expo client

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=http://<your-lan-ip>:54321
EXPO_PUBLIC_TEAM_ID=ABC123DEF4
EXPO_PUBLIC_BUNDLE_IDENTIFIER=com.yourcompany.appattest-demo
```

Find your LAN IP via `ipconfig getifaddr en0` (macOS). Do not use `127.0.0.1` or `localhost` — the iPhone can't reach those on the host machine.

This single `.env.local` file is the source of truth for both the Expo client AND the Supabase edge functions. The edge functions receive `EXPO_PUBLIC_TEAM_ID` and `EXPO_PUBLIC_BUNDLE_IDENTIFIER` via `config.toml`'s `[edge_runtime.secrets]` section and derive `APP_ID = TEAMID.bundleIdentifier` at runtime. No separate server-side env file is needed.

### 5. Start the backend

```bash
npx supabase start
npx supabase db reset
```

### 6. Build and run on iPhone

```bash
npx expo run:ios --device
```

This creates a native development build on the connected iPhone. The first build takes several minutes. Subsequent rebuilds are incremental.

> `expo start --ios` (Expo Go) will **not** work — `@expo/app-integrity` requires native modules that Expo Go doesn't include. Always use `expo run:ios`.

### 7. Verify the flow

1. **Status strip** shows "Not attested" with your Supabase URL
2. Tap **Call unprotected** — timing bar and DB inspector should populate
3. Tap **Attest this device** — generates a key, gets a challenge, attests with Apple, verifies on your server
4. **Status strip** updates to "Attested" with your keyId and signCount: 0
5. Tap **Call protected** — timing bars show all three comparisons, signCount increments

If attestation fails, check:

- **`RP_ID_MISMATCH`**: APP_ID in `supabase/.env.local` doesn't match `TEAMID.bundleIdentifier` from steps 1+2
- **`CHALLENGE_INVALID`**: challenge expired (>60s between issuance and use) — try again
- **`NETWORK_ERROR`**: iPhone can't reach the host — check LAN IP and that `supabase start` is running
- **`INVALID_CERTIFICATE_CHAIN`**: App Attest capability not enabled on the App ID (step 3)

## Project structure

```
demo/supabase-expo-demo/
├── src/                    # Expo client app
│   ├── config.ts           # SUPABASE_URL + APP_ID from env/constants
│   ├── api.ts              # Typed fetch wrappers for edge functions
│   ├── hooks/
│   │   └── useAttestation.ts   # Attestation state machine
│   └── components/         # UI sections (StatusStrip, TimingBars, etc.)
├── supabase/
│   ├── functions/          # Edge functions (challenge, verify-attestation, etc.)
│   │   └── _shared/        # Shared helpers (integrity.ts, timing.ts)
│   ├── migrations/         # Database schema (app_attest_devices, etc.)
│   └── tests/              # Integration test (runs without iPhone)
├── app.config.ts           # Expo config (reads env vars for Team ID + bundle ID)
└── .env.example            # Template for client-side env vars
```

## Running the integration test (no iPhone needed)

The integration test exercises all five edge functions using synthetic assertions:

```bash
npx supabase start
npx supabase db reset
cd supabase
deno run --allow-net --allow-env tests/integration.test.ts
```

This works without an iPhone or Apple Developer account — it uses the fallback `APP_ID` value for both sides.
