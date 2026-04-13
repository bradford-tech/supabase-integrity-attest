// src/components/ErrorSurface.tsx
//
// Props use ErrorResponse from api.ts (not primitive code/message strings)
// so Phase D can filter by code, count by code, and show a history stream
// through the same interface without a refactor.
import { Platform, StyleSheet, Text, View } from "react-native";
import type { ErrorResponse } from "../api";

type Props = {
  /** Structured API error from the last response (null if no error). */
  error: ErrorResponse | null;
  /** General error message from the hook (network errors, etc.). */
  hookError: string | null;
};

export function ErrorSurface({ error, hookError }: Props) {
  if (!error && !hookError) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Error</Text>
      {error?.code && (
        <View style={styles.codeContainer}>
          <Text style={styles.code}>{error.code}</Text>
        </View>
      )}
      <Text style={styles.message}>
        {error?.error ?? hookError ?? "Unknown error"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#991B1B",
  },
  codeContainer: {
    backgroundColor: "#FEE2E2",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  code: {
    fontSize: 13,
    fontWeight: "700",
    color: "#DC2626",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  message: {
    fontSize: 13,
    color: "#7F1D1D",
    lineHeight: 18,
  },
});
