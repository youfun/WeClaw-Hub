import { createCipheriv, createDecipheriv } from "node:crypto";
import type { ImageItem } from "./types.ts";

/**
 * AES-128-ECB encryption with PKCS7 padding.
 */
export function aesEcbEncrypt(plaintext: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length !== 16) throw new Error("AES-128-ECB requires a 16-byte key");
  const cipher = createCipheriv("aes-128-ecb", Buffer.from(key), Buffer.alloc(0));
  return new Uint8Array(Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]));
}

/** Compute AES-128-ECB ciphertext size after PKCS7 padding. */
export function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}

// ---- Pure JS MD5 (Worker-compatible) ----

/**
 * Compute MD5 hash of a Uint8Array.
 * Pure JS implementation for Workers (Web Crypto API doesn't support MD5).
 */
export function md5(bytes: Uint8Array): string {
  // Initialize MD5 state
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  // Pre-processing: padding
  const origLen = bytes.length;
  const padLen = origLen % 64 < 56 ? 56 - (origLen % 64) : 120 - (origLen % 64);
  const totalLen = origLen + padLen + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[origLen] = 0x80;
  // Append original length in bits (little-endian, 64 bits)
  const bitLen = origLen * 8;
  for (let i = 0; i < 4; i++) {
    padded[totalLen - 8 + i] = (bitLen >>> (i * 8)) & 0xff;
  }

  // Process each 64-byte block
  for (let offset = 0; offset < totalLen; offset += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] = padded[offset + i * 4]! |
             (padded[offset + i * 4 + 1]! << 8) |
             (padded[offset + i * 4 + 2]! << 16) |
             (padded[offset + i * 4 + 3]! << 24);
    }

    let A = a0, B = b0, C = c0, D = d0;

    // Round 1
    const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    A = add32(B, rotl32(add32(add32(A, F(B, C, D)), add32(M[0]!, 0xd76aa478)), S11));
    D = add32(A, rotl32(add32(add32(D, F(A, B, C)), add32(M[1]!, 0xe8c7b756)), S12));
    C = add32(D, rotl32(add32(add32(C, F(D, A, B)), add32(M[2]!, 0x242070db)), S13));
    B = add32(C, rotl32(add32(add32(B, F(C, D, A)), add32(M[3]!, 0xc1bdceee)), S14));
    A = add32(B, rotl32(add32(add32(A, F(B, C, D)), add32(M[4]!, 0xf57c0faf)), S11));
    D = add32(A, rotl32(add32(add32(D, F(A, B, C)), add32(M[5]!, 0x4787c62a)), S12));
    C = add32(D, rotl32(add32(add32(C, F(D, A, B)), add32(M[6]!, 0xa8304613)), S13));
    B = add32(C, rotl32(add32(add32(B, F(C, D, A)), add32(M[7]!, 0xfd469501)), S14));
    A = add32(B, rotl32(add32(add32(A, F(B, C, D)), add32(M[8]!, 0x698098d8)), S11));
    D = add32(A, rotl32(add32(add32(D, F(A, B, C)), add32(M[9]!, 0x8b44f7af)), S12));
    C = add32(D, rotl32(add32(add32(C, F(D, A, B)), add32(M[10]!, 0xffff5bb1)), S13));
    B = add32(C, rotl32(add32(add32(B, F(C, D, A)), add32(M[11]!, 0x895cd7be)), S14));
    A = add32(B, rotl32(add32(add32(A, F(B, C, D)), add32(M[12]!, 0x6b901122)), S11));
    D = add32(A, rotl32(add32(add32(D, F(A, B, C)), add32(M[13]!, 0xfd987193)), S12));
    C = add32(D, rotl32(add32(add32(C, F(D, A, B)), add32(M[14]!, 0xa679438e)), S13));
    B = add32(C, rotl32(add32(add32(B, F(C, D, A)), add32(M[15]!, 0x49b40821)), S14));

    // Round 2
    const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    A = add32(B, rotl32(add32(add32(A, G(B, C, D)), add32(M[1]!, 0xf61e2562)), S21));
    D = add32(A, rotl32(add32(add32(D, G(A, B, C)), add32(M[6]!, 0xc040b340)), S22));
    C = add32(D, rotl32(add32(add32(C, G(D, A, B)), add32(M[11]!, 0x265e5a51)), S23));
    B = add32(C, rotl32(add32(add32(B, G(C, D, A)), add32(M[0]!, 0xe9b6c7aa)), S24));
    A = add32(B, rotl32(add32(add32(A, G(B, C, D)), add32(M[5]!, 0xd62f105d)), S21));
    D = add32(A, rotl32(add32(add32(D, G(A, B, C)), add32(M[10]!, 0x02441453)), S22));
    C = add32(D, rotl32(add32(add32(C, G(D, A, B)), add32(M[15]!, 0xd8a1e681)), S23));
    B = add32(C, rotl32(add32(add32(B, G(C, D, A)), add32(M[4]!, 0xe7d3fbc8)), S24));
    A = add32(B, rotl32(add32(add32(A, G(B, C, D)), add32(M[9]!, 0x21e1cde6)), S21));
    D = add32(A, rotl32(add32(add32(D, G(A, B, C)), add32(M[14]!, 0xc33707d6)), S22));
    C = add32(D, rotl32(add32(add32(C, G(D, A, B)), add32(M[3]!, 0xf4d50d87)), S23));
    B = add32(C, rotl32(add32(add32(B, G(C, D, A)), add32(M[8]!, 0x455a14ed)), S24));
    A = add32(B, rotl32(add32(add32(A, G(B, C, D)), add32(M[13]!, 0xa9e3e905)), S21));
    D = add32(A, rotl32(add32(add32(D, G(A, B, C)), add32(M[2]!, 0xfcefa3f8)), S22));
    C = add32(D, rotl32(add32(add32(C, G(D, A, B)), add32(M[7]!, 0x676f02d9)), S23));
    B = add32(C, rotl32(add32(add32(B, G(C, D, A)), add32(M[12]!, 0x8d2a4c8a)), S24));

    // Round 3
    const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    A = add32(B, rotl32(add32(add32(A, H(B, C, D)), add32(M[5]!, 0xfffa3942)), S31));
    D = add32(A, rotl32(add32(add32(D, H(A, B, C)), add32(M[8]!, 0x8771f681)), S32));
    C = add32(D, rotl32(add32(add32(C, H(D, A, B)), add32(M[11]!, 0x6d9d6122)), S33));
    B = add32(C, rotl32(add32(add32(B, H(C, D, A)), add32(M[14]!, 0xfde5380c)), S34));
    A = add32(B, rotl32(add32(add32(A, H(B, C, D)), add32(M[1]!, 0xa4beea44)), S31));
    D = add32(A, rotl32(add32(add32(D, H(A, B, C)), add32(M[4]!, 0x4bdecfa9)), S32));
    C = add32(D, rotl32(add32(add32(C, H(D, A, B)), add32(M[7]!, 0xf6bb4b60)), S33));
    B = add32(C, rotl32(add32(add32(B, H(C, D, A)), add32(M[10]!, 0xbebfbc70)), S34));
    A = add32(B, rotl32(add32(add32(A, H(B, C, D)), add32(M[13]!, 0x289b7ec6)), S31));
    D = add32(A, rotl32(add32(add32(D, H(A, B, C)), add32(M[0]!, 0xeaa127fa)), S32));
    C = add32(D, rotl32(add32(add32(C, H(D, A, B)), add32(M[3]!, 0xd4ef3085)), S33));
    B = add32(C, rotl32(add32(add32(B, H(C, D, A)), add32(M[6]!, 0x04881d05)), S34));
    A = add32(B, rotl32(add32(add32(A, H(B, C, D)), add32(M[9]!, 0xd9d4d039)), S31));
    D = add32(A, rotl32(add32(add32(D, H(A, B, C)), add32(M[12]!, 0xe6db99e5)), S32));
    C = add32(D, rotl32(add32(add32(C, H(D, A, B)), add32(M[15]!, 0x1fa27cf8)), S33));
    B = add32(C, rotl32(add32(add32(B, H(C, D, A)), add32(M[2]!, 0xc4ac5665)), S34));

    // Round 4
    const S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    A = add32(B, rotl32(add32(add32(A, I(B, C, D)), add32(M[0]!, 0xf4292244)), S41));
    D = add32(A, rotl32(add32(add32(D, I(A, B, C)), add32(M[7]!, 0x432aff97)), S42));
    C = add32(D, rotl32(add32(add32(C, I(D, A, B)), add32(M[14]!, 0xab9423a7)), S43));
    B = add32(C, rotl32(add32(add32(B, I(C, D, A)), add32(M[5]!, 0xfc93a039)), S44));
    A = add32(B, rotl32(add32(add32(A, I(B, C, D)), add32(M[12]!, 0x655b59c3)), S41));
    D = add32(A, rotl32(add32(add32(D, I(A, B, C)), add32(M[3]!, 0x8f0ccc92)), S42));
    C = add32(D, rotl32(add32(add32(C, I(D, A, B)), add32(M[10]!, 0xffeff47d)), S43));
    B = add32(C, rotl32(add32(add32(B, I(C, D, A)), add32(M[1]!, 0x85845dd1)), S44));
    A = add32(B, rotl32(add32(add32(A, I(B, C, D)), add32(M[8]!, 0x6fa87e4f)), S41));
    D = add32(A, rotl32(add32(add32(D, I(A, B, C)), add32(M[15]!, 0xfe2ce6e0)), S42));
    C = add32(D, rotl32(add32(add32(C, I(D, A, B)), add32(M[6]!, 0xa3014314)), S43));
    B = add32(C, rotl32(add32(add32(B, I(C, D, A)), add32(M[13]!, 0x4e0811a1)), S44));
    A = add32(B, rotl32(add32(add32(A, I(B, C, D)), add32(M[4]!, 0xf7537e82)), S41));
    D = add32(A, rotl32(add32(add32(D, I(A, B, C)), add32(M[11]!, 0xbd3af235)), S42));
    C = add32(D, rotl32(add32(add32(C, I(D, A, B)), add32(M[2]!, 0x2ad7d2bb)), S43));
    B = add32(C, rotl32(add32(add32(B, I(C, D, A)), add32(M[9]!, 0xeb86d391)), S44));

    a0 = add32(a0, A);
    b0 = add32(b0, B);
    c0 = add32(c0, C);
    d0 = add32(d0, D);
  }

  // Convert to hex
  const toHex = (n: number): string => {
    let r = "";
    for (let i = 0; i < 4; i++) {
      r += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    }
    return r;
  };
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

function F(x: number, y: number, z: number): number { return (x & y) | (~x & z); }
function G(x: number, y: number, z: number): number { return (x & z) | (y & ~z); }
function H(x: number, y: number, z: number): number { return x ^ y ^ z; }
function I(x: number, y: number, z: number): number { return y ^ (x | ~z); }
function rotl32(x: number, n: number): number { return ((x << n) | (x >>> (32 - n))) >>> 0; }
function add32(a: number, b: number): number { return (a + b) >>> 0; }

// ---- CDN Download (AES-128-ECB decryption) ----

const CDN_DOWNLOAD_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c/download";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function unpadPkcs7(bytes: Uint8Array): Uint8Array {
  if (!bytes.length) return bytes;

  const padding = bytes[bytes.length - 1]!;
  if (padding < 1 || padding > 16 || padding > bytes.length) {
    return bytes;
  }

  for (let index = bytes.length - padding; index < bytes.length; index++) {
    if (bytes[index] !== padding) {
      return bytes;
    }
  }

  return bytes.subarray(0, bytes.length - padding);
}

export function parseAesKey(input: string): Uint8Array {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("missing AES key");
  }

  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) {
    return hexToBytes(trimmed.toLowerCase());
  }

  try {
    const bytes = base64ToBytes(trimmed);
    if (bytes.length !== 16) {
      throw new Error("decoded AES key must be 16 bytes");
    }
    return bytes;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid AES key: ${message}`);
  }
}

export function aesEcbDecrypt(ciphertext: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length !== 16) {
    throw new Error("AES-128-ECB requires a 16-byte key");
  }
  if (!ciphertext.length || ciphertext.length % 16 !== 0) {
    throw new Error("ciphertext must be a non-empty multiple of 16 bytes");
  }

  const decipher = createDecipheriv("aes-128-ecb", Buffer.from(key), Buffer.alloc(0));
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext)),
    decipher.final(),
  ]);

  return unpadPkcs7(new Uint8Array(decrypted));
}

export function buildCdnDownloadUrl(encryptedQueryParam: string): string {
  return `${CDN_DOWNLOAD_BASE_URL}?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`;
}

export function inferImageMediaType(bytes: Uint8Array, imageItem?: ImageItem): string {
  if (bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50) {
    return "image/webp";
  }

  const lowerUrl = imageItem?.url?.toLowerCase() ?? "";
  if (lowerUrl.endsWith(".png")) return "image/png";
  if (lowerUrl.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function downloadImage(imageItem: ImageItem): Promise<Uint8Array | null> {
  const encryptedQueryParam = imageItem.media?.encrypt_query_param;
  const rawKey = imageItem.aeskey || imageItem.media?.aes_key;

  if (!encryptedQueryParam || !rawKey) {
    return null;
  }

  try {
    const response = await fetch(buildCdnDownloadUrl(encryptedQueryParam), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error("[cdn] download failed:", response.status);
      return null;
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
      console.error("[cdn] encrypted image exceeds limit or is empty:", buffer.length);
      return null;
    }

    const decrypted = aesEcbDecrypt(buffer, parseAesKey(rawKey));
    if (!decrypted.length || decrypted.length > MAX_IMAGE_BYTES) {
      console.error("[cdn] decrypted image exceeds limit or is empty:", decrypted.length);
      return null;
    }

    return decrypted;
  } catch (err) {
    console.error("[cdn] download/decrypt failed:", err);
    return null;
  }
}