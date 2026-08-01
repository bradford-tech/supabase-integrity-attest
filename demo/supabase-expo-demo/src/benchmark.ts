// src/benchmark.ts
//
// On-device latency benchmark. Runs from a physical iPhone against the
// LAN supabase stack and prints a copy-pasteable report to the Metro
// console. Two parts:
//
//   1. Call loop (N_CALLS alternating unprotected/protected requests):
//      the per-request story — Secure Enclave sign + network + middleware.
//   2. Attestation loop (N_ATTEST fresh keys): the once-per-device story —
//      generateKey + Apple round-trip (attestKeyAsync) + server verify.
//
// Benchmark attestation keys are ephemeral (never persisted to
// SecureStore); their server rows are deleted afterwards via reset-device.
// The call loop advances the real device's sign counter, which is fine —
// counters only need to be monotonic.
import * as AppIntegrity from "@expo/app-integrity";
import { Platform } from "react-native";
import {
  callProtectedEvent,
  callUnprotectedEvent,
  issueChallenge,
  resetDevice,
  verifyAttestation,
} from "./api";

const N_CALLS = 50;
const N_WARMUP = 3;
const N_ATTEST = 3;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function p95(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.95)];
}

/** Format a large sample: median + p95. */
function fmt(xs: number[]): string {
  return `median ${median(xs).toFixed(1)}ms  p95 ${p95(xs).toFixed(1)}ms  (n=${xs.length})`;
}

/** Format a small sample: every value + median. */
function fmtSmall(xs: number[]): string {
  const all = xs.map((x) => x.toFixed(0)).join(", ");
  return `${all} ms  (median ${median(xs).toFixed(0)}ms, n=${xs.length})`;
}

export async function runDeviceBenchmark(keyId: string): Promise<void> {
  const log = (s: string) => console.log(s);
  log("");
  log("=== App Attest on-device benchmark ===");
  log(`platform: ${Platform.OS} ${Platform.Version}`);
  log(
    `call loop: ${N_CALLS} per endpoint (+${N_WARMUP} warmup) · attestations: ${N_ATTEST}`,
  );

  // ---- Part 1: call loop ----
  const un: number[] = [];
  const pro: number[] = [];
  const sign: number[] = [];
  const chal: number[] = [];
  const serverSpans: Record<string, number[]> = {};

  const unprotectedOnce = async (collect: boolean) => {
    const r = await callUnprotectedEvent();
    if (!r.ok) throw new Error(r.error?.error ?? "unprotected call failed");
    if (collect) un.push(r.durationMs);
  };

  const protectedOnce = async (collect: boolean) => {
    const chalStart = performance.now();
    const c = await issueChallenge("assertion");
    const chalMs = performance.now() - chalStart;
    if (!c.ok || !c.data) throw new Error(c.error?.error ?? "challenge failed");

    const bodyString = JSON.stringify({
      challenge: c.data.challenge,
      payload: { via: "benchmark" },
    });
    const bodyBytes = new TextEncoder().encode(bodyString);

    const signStart = performance.now();
    const assertion = await AppIntegrity.generateAssertionAsync(
      keyId,
      bodyString,
    );
    const signMs = performance.now() - signStart;

    const r = await callProtectedEvent(bodyBytes, assertion, keyId);
    if (!r.ok || !r.data) {
      throw new Error(r.error?.error ?? `protected call failed (${r.status})`);
    }
    if (collect) {
      chal.push(chalMs);
      sign.push(signMs);
      pro.push(r.durationMs);
      for (const [k, v] of Object.entries(r.data.spans)) {
        (serverSpans[k] ??= []).push(v);
      }
    }
  };

  for (let i = 0; i < N_WARMUP; i++) {
    await unprotectedOnce(false);
    await protectedOnce(false);
  }
  for (let i = 0; i < N_CALLS; i++) {
    await unprotectedOnce(true);
    await protectedOnce(true);
    if ((i + 1) % 10 === 0) log(`  ...${i + 1}/${N_CALLS}`);
  }

  // ---- Part 2: attestation loop (ephemeral keys) ----
  const genKey: number[] = [];
  const attest: number[] = [];
  const verify: number[] = [];
  for (let i = 0; i < N_ATTEST; i++) {
    const t0 = performance.now();
    const benchKeyId = await AppIntegrity.generateKeyAsync();
    genKey.push(performance.now() - t0);

    const c = await issueChallenge("attestation");
    if (!c.ok || !c.data) throw new Error(c.error?.error ?? "challenge failed");

    const t1 = performance.now();
    const attestationObject = await AppIntegrity.attestKeyAsync(
      benchKeyId,
      c.data.challenge,
    );
    attest.push(performance.now() - t1);

    const v = await verifyAttestation({
      keyId: benchKeyId,
      challenge: c.data.challenge,
      attestation: attestationObject,
    });
    if (!v.ok) throw new Error(v.error?.error ?? "verify-attestation failed");
    verify.push(v.durationMs);

    // Ephemeral benchmark key: remove its server row.
    await resetDevice(benchKeyId);
    log(`  attestation ${i + 1}/${N_ATTEST} done`);
  }

  // ---- Report ----
  const serverTotal =
    serverSpans["total"] !== undefined ? median(serverSpans["total"]) : 0;
  const fullFlow = median(chal) + median(sign) + median(pro);

  log("");
  log("--- per-request (assertion path) ---");
  log(`unprotected round-trip   ${fmt(un)}`);
  log(`protected round-trip     ${fmt(pro)}`);
  log(`median delta             ${(median(pro) - median(un)).toFixed(1)}ms`);
  log(`generateAssertionAsync   ${fmt(sign)}   <- Secure Enclave sign`);
  log(`challenge fetch          ${fmt(chal)}   <- demo's extra round-trip`);
  log(
    `full protected flow      ${fullFlow.toFixed(1)}ms   <- challenge + sign + round-trip (medians)`,
  );
  log("server spans (medians, ms):");
  for (const [k, v] of Object.entries(serverSpans)) {
    log(`  ${k.padEnd(24)} ${median(v).toFixed(2)}`);
  }
  log(
    `network + marshalling ~  ${(median(pro) - serverTotal).toFixed(1)}ms   <- protected round-trip - server total`,
  );
  log("");
  log("--- attestation (once per device, ever) ---");
  log(`generateKeyAsync         ${fmtSmall(genKey)}`);
  log(
    `attestKeyAsync           ${fmtSmall(attest)}   <- includes Apple server round-trip`,
  );
  log(
    `verify round-trip        ${fmtSmall(verify)}   <- server verifyAttestation`,
  );
  log("=== end benchmark ===");
}
