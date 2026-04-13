// src/hooks/useAttestation.ts
//
// Attestation state machine for the demo app. Manages the three-state
// lifecycle (idle → attesting → attested) with keyId persisted in
// expo-secure-store (hardware-backed keychain, WHEN_UNLOCKED_THIS_DEVICE_ONLY).
import * as AppIntegrity from '@expo/app-integrity'
import * as SecureStore from 'expo-secure-store'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type ApiResult,
  type ProtectedEventResponse,
  type UnprotectedEventResponse,
  type VerifyAttestationResponse,
  callProtectedEvent,
  callUnprotectedEvent,
  issueChallenge,
  resetDevice,
  verifyAttestation,
} from '../api'

const KEYID_STORAGE_KEY = 'app_attest_key_id'

export type AttestState = 'idle' | 'attesting' | 'attested'

export type ResetMode = 'server' | 'client' | 'both'

export type UseAttestationReturn = {
  /** Current state of the attestation lifecycle. */
  state: AttestState
  /** Whether AppIntegrity is supported on this device. */
  isSupported: boolean
  /** The Apple-issued keyId if attested; null otherwise. */
  keyId: string | null
  /** Last known sign count from the most recent protected-event response. */
  signCount: number
  /** Whether any async operation is in progress. */
  loading: boolean
  /** Last error from any operation (cleared on next operation start). */
  lastError: string | null
  /** Run the full attestation flow. */
  attest: () => Promise<ApiResult<VerifyAttestationResponse> | null>
  /** Call the protected-event endpoint with a signed assertion. */
  callProtected: (
    payload?: Record<string, unknown>,
  ) => Promise<ApiResult<ProtectedEventResponse> | null>
  /** Call the unprotected-event endpoint (no assertion). */
  callUnprotected: () => Promise<ApiResult<UnprotectedEventResponse> | null>
  /** Reset device state. */
  reset: (mode: ResetMode) => Promise<void>
}

export function useAttestation(): UseAttestationReturn {
  const [state, setState] = useState<AttestState>('idle')
  const [keyId, setKeyId] = useState<string | null>(null)
  const [signCount, setSignCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [isSupported] = useState(() => AppIntegrity.isSupported)

  // Ref to avoid stale closures in async operations.
  const keyIdRef = useRef<string | null>(null)

  // Ref-based lock to prevent concurrent operations. Using a ref (not
  // loading state) avoids stale-closure issues — two rapid taps would
  // both read loading=false from their closure, but busyRef.current is
  // always fresh. Without this, two concurrent attest() calls would each
  // generate a keyId and the second would overwrite the first in
  // SecureStore, orphaning a device row on the server.
  const busyRef = useRef(false)

  // On mount: try to restore keyId from SecureStore.
  // SecureStore error path #2: getItemAsync returns null on first launch
  // or after "both" reset — normal path, stay in idle.
  useEffect(() => {
    ;(async () => {
      try {
        const stored = await SecureStore.getItemAsync(KEYID_STORAGE_KEY)
        if (stored) {
          setKeyId(stored)
          keyIdRef.current = stored
          setState('attested')
        }
      } catch {
        // SecureStore unavailable (e.g., simulator without keychain).
        // Stay in idle — graceful degradation handles this.
      }
    })()
  }, [])

  const attest = useCallback(async () => {
    if (busyRef.current) return null
    if (!isSupported) {
      setLastError('App Attest is not supported on this device')
      return null
    }
    busyRef.current = true
    setLoading(true)
    setLastError(null)
    setState('attesting')

    try {
      // Step 1: Generate a new cryptographic key in the Secure Enclave.
      const newKeyId = await AppIntegrity.generateKeyAsync()

      // Step 2: Get a one-time challenge from the server.
      const challengeResult = await issueChallenge('attestation')
      if (!challengeResult.ok || !challengeResult.data) {
        throw new Error(
          challengeResult.error?.error ?? 'Failed to get challenge',
        )
      }

      // Step 3: Ask Apple to attest the key.
      const attestationObject = await AppIntegrity.attestKeyAsync(
        newKeyId,
        challengeResult.data.challenge,
      )

      // Step 4: Send the attestation to the server for verification.
      const verifyResult = await verifyAttestation({
        keyId: newKeyId,
        challenge: challengeResult.data.challenge,
        attestation: attestationObject,
      })

      if (!verifyResult.ok) {
        throw new Error(
          verifyResult.error?.error ?? 'Attestation verification failed',
        )
      }

      // Step 5: Persist the keyId in SecureStore.
      // SecureStore error path #1: setItemAsync throws (disk full,
      // permissions, etc.) — surface via error state so the user knows
      // attestation needs to be retried. Without this, attestation would
      // appear to succeed but the next app launch would re-attest because
      // the keyId wasn't persisted.
      await SecureStore.setItemAsync(KEYID_STORAGE_KEY, newKeyId)
      setKeyId(newKeyId)
      keyIdRef.current = newKeyId
      setSignCount(0)
      setState('attested')
      return verifyResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLastError(msg)
      // If attestation failed at any step, stay in idle (not attested).
      setState('idle')
      return null
    } finally {
      busyRef.current = false
      setLoading(false)
    }
  }, [isSupported])

  const callProtected = useCallback(
    async (payload?: Record<string, unknown>) => {
      if (busyRef.current) return null
      const currentKeyId = keyIdRef.current
      if (!currentKeyId) {
        setLastError('No keyId — attest first')
        return null
      }
      busyRef.current = true
      setLoading(true)
      setLastError(null)

      try {
        // Step 1: Get a one-time challenge.
        const challengeResult = await issueChallenge('assertion')
        if (!challengeResult.ok || !challengeResult.data) {
          throw new Error(
            challengeResult.error?.error ?? 'Failed to get challenge',
          )
        }

        // Step 2: Build the request body. The challenge is embedded so
        // the server can verify it as a belt-and-suspenders check.
        const bodyObj = {
          challenge: challengeResult.data.challenge,
          payload: payload ?? {
            via: 'demo-app',
            at: new Date().toISOString(),
          },
        }
        const bodyString = JSON.stringify(bodyObj)
        const bodyBytes = new TextEncoder().encode(bodyString)

        // Step 3: Sign the EXACT body string with the attested key.
        // generateAssertionAsync signs the string, and the server's
        // withAssertion middleware verifies against the raw body bytes
        // (which are the UTF-8 encoding of this string).
        const assertion = await AppIntegrity.generateAssertionAsync(
          currentKeyId,
          bodyString,
        )

        // Step 4: Send the signed request.
        const result = await callProtectedEvent(
          bodyBytes,
          assertion,
          currentKeyId,
        )

        if (result.ok && result.data) {
          setSignCount(result.data.signCount)
        }

        // SecureStore error path #3: server returns 401 DEVICE_NOT_FOUND
        // because the server was reset without a client reset (or the DB
        // was wiped). The hook catches this specific error code and
        // transitions back to idle automatically (spec §7.1 step 2e).
        // This is the "stale client keyId" case that makes the three-mode
        // reset work for developers testing edge cases.
        if (!result.ok && result.error?.code === 'DEVICE_NOT_FOUND') {
          await SecureStore.deleteItemAsync(KEYID_STORAGE_KEY)
          setKeyId(null)
          keyIdRef.current = null
          setSignCount(0)
          setState('idle')
          setLastError('Device not found on server — re-attest required')
        } else if (!result.ok) {
          setLastError(result.error?.error ?? `HTTP ${result.status}`)
        }

        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setLastError(msg)
        return null
      } finally {
        busyRef.current = false
        setLoading(false)
      }
    },
    [],
  )

  const callUnprotected = useCallback(async () => {
    if (busyRef.current) return null
    busyRef.current = true
    setLoading(true)
    setLastError(null)
    try {
      const result = await callUnprotectedEvent()
      if (!result.ok) {
        setLastError(result.error?.error ?? `HTTP ${result.status}`)
      }
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLastError(msg)
      return null
    } finally {
      busyRef.current = false
      setLoading(false)
    }
  }, [])

  const reset = useCallback(async (mode: ResetMode) => {
    if (busyRef.current) return
    busyRef.current = true
    setLoading(true)
    setLastError(null)
    try {
      const currentKeyId = keyIdRef.current

      if ((mode === 'server' || mode === 'both') && currentKeyId) {
        const result = await resetDevice(currentKeyId)
        if (!result.ok) {
          throw new Error(result.error?.error ?? 'Server reset failed')
        }
      }

      // Intentional per spec §7.2: reset('server') leaves the client in
      // attested state with a stale keyId. The next callProtected() will
      // return DEVICE_NOT_FOUND and auto-recover to idle. Surface this
      // expected behavior so the developer knows what to expect.
      if (mode === 'server') {
        setLastError(
          'Server reset — device will re-attest on next protected call',
        )
      }

      if (mode === 'client' || mode === 'both') {
        await SecureStore.deleteItemAsync(KEYID_STORAGE_KEY)
        setKeyId(null)
        keyIdRef.current = null
        setSignCount(0)
        setState('idle')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLastError(msg)
    } finally {
      busyRef.current = false
      setLoading(false)
    }
  }, [])

  return {
    state,
    isSupported,
    keyId,
    signCount,
    loading,
    lastError,
    attest,
    callProtected,
    callUnprotected,
    reset,
  }
}
