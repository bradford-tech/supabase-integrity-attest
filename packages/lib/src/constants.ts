// src/constants.ts

/** Apple App Attestation Root CA (single cert for both dev and prod environments). */
export const APPLE_APP_ATTESTATION_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----`;

/** Production AAGUID: "appattest" + 7 null bytes (16 bytes total) */
export const AAGUID_PRODUCTION = new Uint8Array([
  0x61,
  0x70,
  0x70,
  0x61,
  0x74,
  0x74,
  0x65,
  0x73,
  0x74,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
]);

/** Development AAGUID: "appattestdevelop" (16 bytes, no nulls) */
export const AAGUID_DEVELOPMENT = new Uint8Array([
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

/** OID for the Apple App Attest nonce extension in credential certificates */
export const APPLE_NONCE_EXTENSION_OID = "1.2.840.113635.100.8.2";
