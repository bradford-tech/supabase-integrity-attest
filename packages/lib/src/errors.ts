// src/errors.ts

/** Error codes returned by {@linkcode AttestationError}. */
export enum AttestationErrorCode {
  /** CBOR decoding or structural validation failed. */
  INVALID_FORMAT = "INVALID_FORMAT",
  /** X.509 certificate chain verification failed. */
  INVALID_CERTIFICATE_CHAIN = "INVALID_CERTIFICATE_CHAIN",
  /** Computed nonce does not match the nonce in the leaf certificate. */
  NONCE_MISMATCH = "NONCE_MISMATCH",
  /** RP ID hash does not match SHA-256 of the app ID. */
  RP_ID_MISMATCH = "RP_ID_MISMATCH",
  /** Public key hash does not match the provided key ID. */
  KEY_ID_MISMATCH = "KEY_ID_MISMATCH",
  /** Sign count is not zero (required for attestation). */
  INVALID_COUNTER = "INVALID_COUNTER",
  /** AAGUID does not match the expected environment (production/development). */
  INVALID_AAGUID = "INVALID_AAGUID",
}

/** Thrown when attestation verification fails. */
export class AttestationError extends Error {
  /** Discriminant for `instanceof` checks in catch blocks. Always `"AttestationError"`. */
  override readonly name = "AttestationError";
  /** Create an AttestationError with a machine-readable code and human-readable message. */
  constructor(
    /** Machine-readable error code. */
    public readonly code: AttestationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Error codes returned by {@linkcode AssertionError}. */
export enum AssertionErrorCode {
  /** CBOR decoding or structural validation failed. */
  INVALID_FORMAT = "INVALID_FORMAT",
  /** RP ID hash does not match SHA-256 of the app ID. */
  RP_ID_MISMATCH = "RP_ID_MISMATCH",
  /** Sign count was not greater than the previously stored value. */
  COUNTER_NOT_INCREMENTED = "COUNTER_NOT_INCREMENTED",
  /** ECDSA signature verification failed. */
  SIGNATURE_INVALID = "SIGNATURE_INVALID",
  /** No device key found for the given device ID (used by {@linkcode withAssertion}). */
  DEVICE_NOT_FOUND = "DEVICE_NOT_FOUND",
  /** An internal or storage callback error occurred (used by {@linkcode withAssertion}). */
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/** Thrown when assertion verification fails. */
export class AssertionError extends Error {
  /** Discriminant for `instanceof` checks in catch blocks. Always `"AssertionError"`. */
  override readonly name = "AssertionError";
  /** Create an AssertionError with a machine-readable code and human-readable message. */
  constructor(
    /** Machine-readable error code. */
    public readonly code: AssertionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
