// src/components/DbInspector.tsx
//
// Collapsible per-table cards showing the rows affected by the last
// request. The sign_count field shows a diff animation (prev → new)
// when it changes — this is the hero visual per spec §8.1 item 4.
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type DeviceInfo = {
  deviceId: string;
  signCount: number;
};

type EventInfo = {
  id: number;
  protected: boolean;
  device_id: string | null;
  created_at: string;
};

type Props = {
  device: DeviceInfo | null;
  event: EventInfo | null;
};

/**
 * Animated sign_count diff — the "42 → 43" flash that teaches replay
 * protection visually. Full fade from green background to transparent
 * over 1.5s using React Native's Animated API.
 */
function SignCountDiff({
  current,
  previous,
}: {
  current: number;
  previous: number | null;
}) {
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (previous !== null && previous !== current) {
      flashAnim.setValue(1);
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 1500,
        useNativeDriver: false,
      }).start();
    }
  }, [current, previous, flashAnim]);

  const bgColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(34, 197, 94, 0)", "rgba(34, 197, 94, 0.3)"],
  });

  return (
    <Animated.View style={[styles.diffContainer, { backgroundColor: bgColor }]}>
      {previous !== null && previous !== current ? (
        <Text style={styles.diffText}>
          {previous} → {current}
        </Text>
      ) : (
        <Text style={styles.diffText}>{current}</Text>
      )}
    </Animated.View>
  );
}

function TableCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={styles.cardHeader}
      >
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
      </Pressable>
      {expanded && <View style={styles.cardBody}>{children}</View>}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function DbInspector({ device, event }: Props) {
  const prevSignCount = useRef<number | null>(null);
  const [prevSc, setPrevSc] = useState<number | null>(null);

  useEffect(() => {
    if (device) {
      setPrevSc(prevSignCount.current);
      prevSignCount.current = device.signCount;
    }
  }, [device?.signCount]);

  if (!device && !event) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Database state</Text>

      {device && (
        <TableCard title="app_attest_devices">
          <Row label="device_id" value={`${device.deviceId.slice(0, 12)}…`} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>sign_count</Text>
            <SignCountDiff current={device.signCount} previous={prevSc} />
          </View>
        </TableCard>
      )}

      {event && (
        <TableCard title="demo_events">
          <Row label="id" value={String(event.id)} />
          <Row label="protected" value={String(event.protected)} />
          <Row label="device_id" value={event.device_id ?? "(null)"} />
          <Row label="created_at" value={event.created_at} />
        </TableCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
    marginBottom: 24,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  chevron: {
    fontSize: 14,
    color: "#94A3B8",
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  rowValue: {
    fontSize: 12,
    color: "#1E293B",
    fontWeight: "500",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    maxWidth: "60%",
    textAlign: "right",
  },
  diffContainer: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  diffText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16A34A",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
});
