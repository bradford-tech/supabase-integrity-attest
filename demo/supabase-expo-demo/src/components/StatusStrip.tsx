// src/components/StatusStrip.tsx
import {
  ActionSheetIOS,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SUPABASE_URL } from '../config'
import type { AttestState, ResetMode } from '../hooks/useAttestation'

type Props = {
  state: AttestState
  isSupported: boolean
  keyId: string | null
  signCount: number
  loading: boolean
  onReset: (mode: ResetMode) => void
}

export function StatusStrip({
  state,
  isSupported,
  keyId,
  signCount,
  loading,
  onReset,
}: Props) {
  const showResetMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            'Cancel',
            'Reset server only',
            'Reset client only',
            'Reset both (recommended)',
          ],
          destructiveButtonIndex: 3,
          cancelButtonIndex: 0,
          title: 'Reset device attestation',
          message:
            'Server-only keeps the local keyId. Client-only orphans the server row. Both fully resets.',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) onReset('server')
          else if (buttonIndex === 2) onReset('client')
          else if (buttonIndex === 3) onReset('both')
        },
      )
    }
  }

  const truncatedKeyId = keyId
    ? `${keyId.slice(0, 8)}…${keyId.slice(-4)}`
    : null

  // Distinguish "not supported" from "not attested" — these are
  // different states per watch-out A. A developer in the simulator
  // should see "Not supported", not "Not attested".
  const badgeLabel = !isSupported
    ? 'Not supported'
    : state === 'attested'
      ? 'Attested'
      : state === 'attesting'
        ? 'Attesting…'
        : 'Not attested'

  const badgeStyle = !isSupported
    ? styles.badgeUnsupported
    : state === 'attested'
      ? styles.badgeAttested
      : state === 'attesting'
        ? styles.badgeAttesting
        : styles.badgeIdle

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.badge, badgeStyle]}>
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </View>
        {state === 'attested' && keyId && (
          <Pressable
            onPress={showResetMenu}
            disabled={loading}
            style={({ pressed }) => [
              styles.resetButton,
              pressed && styles.resetButtonPressed,
            ]}
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
        )}
      </View>
      {state === 'attested' && keyId && (
        <Text style={styles.detail} numberOfLines={1}>
          keyId: {truncatedKeyId} · signCount: {signCount}
        </Text>
      )}
      <Text style={styles.envInfo} numberOfLines={1}>
        {SUPABASE_URL}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeIdle: { backgroundColor: '#FEE2E2' },
  badgeAttesting: { backgroundColor: '#FEF3C7' },
  badgeAttested: { backgroundColor: '#D1FAE5' },
  badgeUnsupported: { backgroundColor: '#E2E8F0' },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  detail: {
    fontSize: 12,
    color: '#64748B',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  envInfo: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  resetButtonPressed: {
    backgroundColor: '#FECACA',
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
})
