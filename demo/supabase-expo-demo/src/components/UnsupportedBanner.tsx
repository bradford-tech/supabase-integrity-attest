// src/components/UnsupportedBanner.tsx
import { StyleSheet, Text, View } from "react-native";

/**
 * Permanent banner shown when App Attest is not supported on this device
 * (e.g., iOS simulator, pre-iPhone 5s). The unprotected-event button
 * remains functional so the developer can verify the Supabase backend
 * is reachable, but attestation and protected-event flows are disabled.
 */
export function UnsupportedBanner() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠</Text>
      <View style={styles.textContainer}>
        <Text style={styles.title}>App Attest unavailable</Text>
        <Text style={styles.body}>
          This device does not support App Attest (requires iOS 14+ with Secure
          Enclave hardware). The attestation and protected endpoint flows are
          disabled. Use a physical iPhone to test the full demo.
        </Text>
        <Text style={styles.hint}>
          The &quot;Call unprotected&quot; button still works — use it to verify
          your Supabase backend is reachable.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
    gap: 12,
  },
  icon: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#92400E",
  },
  body: {
    fontSize: 13,
    color: "#92400E",
    lineHeight: 18,
  },
  hint: {
    fontSize: 13,
    color: "#B45309",
    fontStyle: "italic",
    marginTop: 4,
  },
});
