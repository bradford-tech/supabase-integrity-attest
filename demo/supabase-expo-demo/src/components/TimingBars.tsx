// src/components/TimingBars.tsx
//
// Three horizontal bars showing the timing breakdown of:
// 1. Most recent unprotected call (baseline)
// 2. First protected call after attestation (includes attestation overhead)
// 3. Most recent protected call (steady-state cost)
//
// The delta between bars 1 and 3 is the headline number every developer
// actually cares about: "what does this cost me per request forever?"
//
// Client-measured total intentionally — this is what the user experiences,
// not the server's internal spans. Server breakdown available for the
// Phase D raw response drawer.
import { Platform, StyleSheet, Text, View } from 'react-native'

export type TimingEntry = {
  label: string
  totalMs: number
  spans: Record<string, number>
  cold: boolean
}

type Props = {
  unprotected: TimingEntry | null
  protectedFirst: TimingEntry | null
  protectedSteady: TimingEntry | null
}

function Bar({
  entry,
  maxMs,
  color,
  placeholder,
}: {
  entry: TimingEntry | null
  maxMs: number
  color: string
  placeholder: string
}) {
  if (!entry) {
    return (
      <View style={styles.barRow}>
        <Text style={styles.barLabel}>{placeholder}</Text>
        <View style={[styles.barTrack, { backgroundColor: '#F1F5F9' }]}>
          <Text style={styles.placeholderText}>Press a button</Text>
        </View>
        <Text style={styles.barValue}>—</Text>
      </View>
    )
  }

  const width = maxMs > 0 ? Math.max((entry.totalMs / maxMs) * 100, 5) : 5

  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>
        {entry.label}
      </Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(width, 100)}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.barValue}>
        {entry.totalMs.toFixed(0)}ms{entry.cold ? ' ❄️' : ''}
      </Text>
    </View>
  )
}

export function TimingBars({
  unprotected,
  protectedFirst,
  protectedSteady,
}: Props) {
  const maxMs = Math.max(
    unprotected?.totalMs ?? 0,
    protectedFirst?.totalMs ?? 0,
    protectedSteady?.totalMs ?? 0,
    1, // avoid division by zero
  )

  const delta =
    unprotected && protectedSteady
      ? protectedSteady.totalMs - unprotected.totalMs
      : null

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Timing comparison</Text>
      <Bar
        entry={unprotected}
        maxMs={maxMs}
        color="#EF4444"
        placeholder="Unprotected"
      />
      <Bar
        entry={protectedFirst}
        maxMs={maxMs}
        color="#3B82F6"
        placeholder="Protected (1st)"
      />
      <Bar
        entry={protectedSteady}
        maxMs={maxMs}
        color="#22C55E"
        placeholder="Protected"
      />
      {delta !== null && (
        <Text style={styles.delta}>
          App Attest overhead (steady state): +{delta.toFixed(0)}ms
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    width: 80,
    fontSize: 11,
    color: '#64748B',
  },
  barTrack: {
    flex: 1,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  placeholderText: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
  },
  barValue: {
    width: 76,
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '600',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    textAlign: 'right',
  },
  delta: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
})
