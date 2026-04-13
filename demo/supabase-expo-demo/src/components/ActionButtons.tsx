// src/components/ActionButtons.tsx
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { AttestState } from "../hooks/useAttestation";

type Props = {
  state: AttestState;
  isSupported: boolean;
  loading: boolean;
  onCallUnprotected: () => void;
  onCallProtected: () => void;
  onAttest: () => void;
};

export function ActionButtons({
  state,
  isSupported,
  loading,
  onCallUnprotected,
  onCallProtected,
  onAttest,
}: Props) {
  const canProtect = isSupported && state === "attested" && !loading;
  const canAttest = isSupported && state === "idle" && !loading;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onCallUnprotected}
        disabled={loading}
        style={({ pressed }) => [
          styles.button,
          styles.unprotectedButton,
          pressed && styles.unprotectedButtonPressed,
          loading && styles.buttonDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Text style={styles.buttonText}>Call unprotected</Text>
          </>
        )}
      </Pressable>

      {state === "attested" ? (
        <Pressable
          onPress={onCallProtected}
          disabled={!canProtect}
          style={({ pressed }) => [
            styles.button,
            styles.protectedButton,
            pressed && canProtect && styles.protectedButtonPressed,
            !canProtect && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Call protected</Text>
          )}
        </Pressable>
      ) : (
        <Pressable
          onPress={onAttest}
          disabled={!canAttest}
          style={({ pressed }) => [
            styles.button,
            styles.attestButton,
            pressed && canAttest && styles.attestButtonPressed,
            !canAttest && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>
              {isSupported ? "Attest this device" : "Not supported"}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  unprotectedButton: { backgroundColor: "#EF4444" },
  unprotectedButtonPressed: { backgroundColor: "#DC2626" },
  protectedButton: { backgroundColor: "#22C55E" },
  protectedButtonPressed: { backgroundColor: "#16A34A" },
  attestButton: { backgroundColor: "#3B82F6" },
  attestButtonPressed: { backgroundColor: "#2563EB" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
