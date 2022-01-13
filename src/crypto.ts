import * as sha from 'sha.js';

export function shaThis(input: string): string {
  return sha('256').update(input).digest('hex');
}

// limit of Crypto.getRandomValues()
// https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues
const MAX_BYTES = 65536

/** @param {*} [b=20] */
/* export function randomBytes (b: number = 20) {
  const same = ArrayBuffer.isView(b)
  const bytes = ArrayBuffer.isView(b)
    ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
    : new Uint8Array(same ? b : Number(b))

  for (let i = 0; i < bytes.byteLength; i += MAX_BYTES) {
    crypto.getRandomValues(bytes.subarray(i, i + MAX_BYTES))
  }

  return same ? b : bytes
} */
