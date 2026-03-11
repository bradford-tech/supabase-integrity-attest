// src/errors.ts

export enum AttestationErrorCode {
  INVALID_FORMAT = "INVALID_FORMAT",
  INVALID_CERTIFICATE_CHAIN = "INVALID_CERTIFICATE_CHAIN",
  NONCE_MISMATCH = "NONCE_MISMATCH",
  RP_ID_MISMATCH = "RP_ID_MISMATCH",
  KEY_ID_MISMATCH = "KEY_ID_MISMATCH",
  INVALID_COUNTER = "INVALID_COUNTER",
  INVALID_AAGUID = "INVALID_AAGUID",
}

export class AttestationError extends Error {
  override readonly name = "AttestationError";
  constructor(
    public readonly code: AttestationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export enum AssertionErrorCode {
  INVALID_FORMAT = "INVALID_FORMAT",
  RP_ID_MISMATCH = "RP_ID_MISMATCH",
  COUNTER_NOT_INCREMENTED = "COUNTER_NOT_INCREMENTED",
  SIGNATURE_INVALID = "SIGNATURE_INVALID",
  DEVICE_NOT_FOUND = "DEVICE_NOT_FOUND",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export class AssertionError extends Error {
  override readonly name = "AssertionError";
  constructor(
    public readonly code: AssertionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
