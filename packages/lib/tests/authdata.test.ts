// tests/authdata.test.ts
import { assertEquals, assertThrows } from "@std/assert";
import {
  parseAssertionAuthData,
  parseAttestationAuthData,
} from "../src/authdata.ts";
import { decodeBase64 } from "@std/encoding/base64";

const EXPECTED_RP_ID_HASH = decodeBase64(
  "FVhAM8lQuf6dUUziohGjJtcaprEBSrTG+i+9qdmqGKY=",
);
const EXPECTED_CREDENTIAL_ID = decodeBase64(
  "bSrEhF8TIzIvWSPwvZ0i2+UOBre4ASH84rK15m6emNY=",
);

function buildTestAttestationAuthData(): Uint8Array {
  const rpIdHash = EXPECTED_RP_ID_HASH;
  const flags = new Uint8Array([0x41]);
  const signCount = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
  const aaguid = new Uint8Array([
    0x61,
    0x70,
    0x70,
    0x61,
    0x74,
    0x74,
    0x65,
    0x73,
    0x74,
    0x64,
    0x65,
    0x76,
    0x65,
    0x6c,
    0x6f,
    0x70,
  ]);
  const credIdLen = new Uint8Array([0x00, 0x20]);
  const credId = EXPECTED_CREDENTIAL_ID;
  const total = 32 + 1 + 4 + 16 + 2 + 32;
  const result = new Uint8Array(total);
  let offset = 0;
  result.set(rpIdHash, offset);
  offset += 32;
  result.set(flags, offset);
  offset += 1;
  result.set(signCount, offset);
  offset += 4;
  result.set(aaguid, offset);
  offset += 16;
  result.set(credIdLen, offset);
  offset += 2;
  result.set(credId, offset);
  return result;
}

Deno.test("parseAttestationAuthData extracts all fields correctly", () => {
  const authData = buildTestAttestationAuthData();
  const parsed = parseAttestationAuthData(authData);

  assertEquals(parsed.rpIdHash, EXPECTED_RP_ID_HASH);
  assertEquals(parsed.flags, 0x41);
  assertEquals(parsed.signCount, 0);
  assertEquals(parsed.aaguid.length, 16);
  assertEquals(parsed.credentialId, EXPECTED_CREDENTIAL_ID);
});

Deno.test("parseAttestationAuthData rejects truncated data", () => {
  assertThrows(
    () => parseAttestationAuthData(new Uint8Array(36)),
    Error,
  );
});

Deno.test("parseAssertionAuthData extracts fields from 37-byte data", () => {
  const rpIdHash = new Uint8Array(32).fill(0xab);
  const flags = new Uint8Array([0x01]);
  const signCount = new Uint8Array([0x00, 0x00, 0x00, 0x05]);

  const authData = new Uint8Array(37);
  authData.set(rpIdHash, 0);
  authData.set(flags, 32);
  authData.set(signCount, 33);

  const parsed = parseAssertionAuthData(authData);
  assertEquals(parsed.rpIdHash, rpIdHash);
  assertEquals(parsed.flags, 0x01);
  assertEquals(parsed.signCount, 5);
});

Deno.test("parseAssertionAuthData reads big-endian signCount correctly", () => {
  const authData = new Uint8Array(37);
  authData[33] = 0x01;
  authData[34] = 0x02;
  authData[35] = 0x03;
  authData[36] = 0x04;
  const parsed = parseAssertionAuthData(authData);
  assertEquals(parsed.signCount, 16909060);
});
