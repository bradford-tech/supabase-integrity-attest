// App.tsx
//
// Root component. Composes all Phase C sections in a vertical scroll
// layout. No business logic here — the useAttestation hook owns the
// attestation state, and each section component owns its own rendering.
// App.tsx is a layout shell.
import { useCallback, useRef, useState } from "react";
import { ScrollView, StatusBar, StyleSheet, Text } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { ErrorResponse } from "./src/api";
import { ActionButtons } from "./src/components/ActionButtons";
import { DbInspector } from "./src/components/DbInspector";
import { ErrorSurface } from "./src/components/ErrorSurface";
import { StatusStrip } from "./src/components/StatusStrip";
import { type TimingEntry, TimingBars } from "./src/components/TimingBars";
import { UnsupportedBanner } from "./src/components/UnsupportedBanner";
import { useAttestation } from "./src/hooks/useAttestation";

export default function App() {
  const attestation = useAttestation();

  // Timing state for the three bars.
  const [unprotectedTiming, setUnprotectedTiming] =
    useState<TimingEntry | null>(null);
  const [protectedFirstTiming, setProtectedFirstTiming] =
    useState<TimingEntry | null>(null);
  const [protectedSteadyTiming, setProtectedSteadyTiming] =
    useState<TimingEntry | null>(null);
  const protectedCallCount = useRef(0);

  // DB state for the inspector.
  const [lastDevice, setLastDevice] = useState<{
    deviceId: string;
    signCount: number;
  } | null>(null);
  const [lastEvent, setLastEvent] = useState<{
    id: number;
    protected: boolean;
    device_id: string | null;
    created_at: string;
  } | null>(null);

  // Last error for the error surface.
  const [lastApiError, setLastApiError] = useState<ErrorResponse | null>(null);

  const handleUnprotected = useCallback(async () => {
    setLastApiError(null);
    const result = await attestation.callUnprotected();
    if (result?.ok && result.data) {
      setUnprotectedTiming({
        label: "Unprotected",
        totalMs: result.durationMs,
        spans: result.data.spans,
        cold: result.data.cold,
      });
      setLastEvent({
        id: result.data.event.id,
        protected: result.data.event.protected,
        device_id: result.data.event.device_id,
        created_at: result.data.event.created_at,
      });
      setLastDevice(null); // Unprotected has no device context.
    } else if (result?.error) {
      setLastApiError(result.error);
    }
  }, [attestation]);

  const handleProtected = useCallback(async () => {
    setLastApiError(null);
    const result = await attestation.callProtected();
    if (result?.ok && result.data) {
      const timing: TimingEntry = {
        label:
          protectedCallCount.current === 0 ? "Protected (1st)" : "Protected",
        totalMs: result.durationMs,
        spans: result.data.spans,
        cold: result.data.cold,
      };

      if (protectedCallCount.current === 0) {
        setProtectedFirstTiming(timing);
      }
      setProtectedSteadyTiming(timing);
      protectedCallCount.current++;

      setLastDevice({
        deviceId: result.data.deviceId,
        signCount: result.data.signCount,
      });
      setLastEvent({
        id: result.data.event.id,
        protected: result.data.event.protected,
        device_id: result.data.event.device_id,
        created_at: result.data.event.created_at,
      });
    } else if (result?.error) {
      setLastApiError(result.error);
    }
  }, [attestation]);

  const handleAttest = useCallback(async () => {
    setLastApiError(null);
    protectedCallCount.current = 0;
    setProtectedFirstTiming(null);
    setProtectedSteadyTiming(null);
    const result = await attestation.attest();
    if (!result?.ok && result?.error) {
      setLastApiError(result.error);
    }
  }, [attestation]);

  const handleReset = useCallback(
    async (mode: "server" | "client" | "both") => {
      setLastApiError(null);
      await attestation.reset(mode);
      // Clear visualization state on full reset.
      if (mode === "client" || mode === "both") {
        protectedCallCount.current = 0;
        setProtectedFirstTiming(null);
        setProtectedSteadyTiming(null);
        setLastDevice(null);
        setLastEvent(null);
      }
    },
    [attestation],
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.header}>App Attest Demo</Text>

          <StatusStrip
            state={attestation.state}
            isSupported={attestation.isSupported}
            keyId={attestation.keyId}
            signCount={attestation.signCount}
            loading={attestation.loading}
            onReset={handleReset}
          />

          {!attestation.isSupported && <UnsupportedBanner />}

          <ActionButtons
            state={attestation.state}
            isSupported={attestation.isSupported}
            loading={attestation.loading}
            onCallUnprotected={handleUnprotected}
            onCallProtected={handleProtected}
            onAttest={handleAttest}
          />

          <ErrorSurface
            error={lastApiError}
            hookError={attestation.lastError}
          />

          <TimingBars
            unprotected={unprotectedTiming}
            protectedFirst={protectedFirstTiming}
            protectedSteady={protectedSteadyTiming}
          />

          <DbInspector device={lastDevice} event={lastEvent} />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    paddingVertical: 16,
  },
});
