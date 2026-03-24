/**
 * Constant-time string comparison to prevent timing attacks on secret values.
 * Uses the Web Crypto API's timingSafeEqual equivalent via byte comparison.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.byteLength !== bufB.byteLength) {
    // Compare against self to burn same time, then return false
    const dummy = new Uint8Array(bufA.byteLength);
    let result = 0;
    for (let i = 0; i < bufA.byteLength; i++) {
      result |= bufA[i] ^ dummy[i];
    }
    // Always return false for length mismatch, but after constant-time work
    return false && result === 0;
  }

  let result = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}
