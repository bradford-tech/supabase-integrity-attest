// src/der.ts

export function derToRaw(
  der: Uint8Array,
  componentSize = 32,
): Uint8Array {
  if (der[0] !== 0x30) {
    throw new Error("Invalid DER signature: expected SEQUENCE tag (0x30)");
  }

  let offset = 2;
  if (der[1] & 0x80) {
    const lengthBytes = der[1] & 0x7f;
    offset = 2 + lengthBytes;
  }

  const raw = new Uint8Array(componentSize * 2);

  if (der[offset] !== 0x02) {
    throw new Error(
      "Invalid DER signature: expected INTEGER tag (0x02) for r",
    );
  }
  offset++;
  const rLen = der[offset++];
  const rBytes = der.subarray(offset, offset + rLen);
  offset += rLen;

  if (der[offset] !== 0x02) {
    throw new Error(
      "Invalid DER signature: expected INTEGER tag (0x02) for s",
    );
  }
  offset++;
  const sLen = der[offset++];
  const sBytes = der.subarray(offset, offset + sLen);

  copyInteger(rBytes, raw, 0, componentSize);
  copyInteger(sBytes, raw, componentSize, componentSize);

  return raw;
}

export function rawToDer(
  raw: Uint8Array,
  componentSize = 32,
): Uint8Array {
  if (raw.length !== componentSize * 2) {
    throw new Error(
      `Invalid raw signature: expected ${
        componentSize * 2
      } bytes, got ${raw.length}`,
    );
  }

  const r = encodeInteger(raw.subarray(0, componentSize));
  const s = encodeInteger(raw.subarray(componentSize, componentSize * 2));
  const seqLen = r.length + s.length;

  const der = new Uint8Array(2 + seqLen);
  der[0] = 0x30;
  der[1] = seqLen;
  der.set(r, 2);
  der.set(s, 2 + r.length);
  return der;
}

function copyInteger(
  src: Uint8Array,
  dst: Uint8Array,
  dstOffset: number,
  componentSize: number,
): void {
  let srcOffset = 0;
  while (srcOffset < src.length - 1 && src[srcOffset] === 0) {
    srcOffset++;
  }
  const len = src.length - srcOffset;
  if (len > componentSize) {
    throw new Error(`Integer too large: ${len} bytes`);
  }
  dst.set(src.subarray(srcOffset), dstOffset + (componentSize - len));
}

function encodeInteger(value: Uint8Array): Uint8Array {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) {
    start++;
  }
  const needsPadding = value[start] & 0x80;
  const len = value.length - start + (needsPadding ? 1 : 0);

  const result = new Uint8Array(2 + len);
  result[0] = 0x02;
  result[1] = len;
  if (needsPadding) {
    result[2] = 0x00;
    result.set(value.subarray(start), 3);
  } else {
    result.set(value.subarray(start), 2);
  }
  return result;
}
