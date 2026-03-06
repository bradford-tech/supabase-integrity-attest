// src/authdata.ts

export interface AssertionAuthData {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
}

export interface AttestationAuthData extends AssertionAuthData {
  aaguid: Uint8Array;
  credentialId: Uint8Array;
  coseKeyBytes: Uint8Array;
}

export function parseAssertionAuthData(data: Uint8Array): AssertionAuthData {
  if (data.length < 37) {
    throw new Error(
      `authenticatorData too short: expected at least 37 bytes, got ${data.length}`,
    );
  }

  const rpIdHash = data.slice(0, 32);
  const flags = data[32];
  const signCount = new DataView(
    data.buffer,
    data.byteOffset + 33,
    4,
  ).getUint32(0, false);

  return { rpIdHash, flags, signCount };
}

export function parseAttestationAuthData(
  data: Uint8Array,
): AttestationAuthData {
  const base = parseAssertionAuthData(data);

  if (data.length < 55) {
    throw new Error(
      `attestation authenticatorData too short: expected at least 55 bytes, got ${data.length}`,
    );
  }

  const aaguid = data.slice(37, 53);
  const credentialIdLength = new DataView(
    data.buffer,
    data.byteOffset + 53,
    2,
  ).getUint16(0, false);

  if (data.length < 55 + credentialIdLength) {
    throw new Error(
      `authenticatorData truncated: credentialIdLength=${credentialIdLength} but only ${
        data.length - 55
      } bytes remain`,
    );
  }

  const credentialId = data.slice(55, 55 + credentialIdLength);
  const coseKeyBytes = data.slice(55 + credentialIdLength);

  return {
    ...base,
    aaguid,
    credentialId,
    coseKeyBytes,
  };
}
