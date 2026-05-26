import { createDecipheriv } from "node:crypto";
import type { ImageItem } from "./types.ts";

// ---- AES-128-ECB Encryption (pure JS, Worker-compatible) ----

/** AES-128 S-box */
const SBOX = new Uint8Array([
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]);

/** Round constants for key expansion */
const RCON = new Uint8Array([
  0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36,
]);

/** Multiply by 2 in GF(2^8) — used by MixColumns */
function gfMul2(n: number): number {
  const s = (n << 1) & 0xff;
  return (n & 0x80) ? s ^ 0x1b : s;
}

/** Expand 16-byte key into 11 round keys (176 bytes) */
function keyExpansion(key: Uint8Array): Uint32Array {
  const w = new Uint32Array(44); // AES-128: 4 words * 11 rounds
  for (let i = 0; i < 4; i++) {
    w[i] = (key[4*i]! << 24) | (key[4*i+1]! << 16) | (key[4*i+2]! << 8) | key[4*i+3]!;
  }
  for (let i = 4; i < 44; i++) {
    let t = w[i-1]!;
    if (i % 4 === 0) {
      // RotWord
      t = ((t << 8) | (t >>> 24)) >>> 0;
      // SubWord
      t = (SBOX[(t >>> 24) & 0xff]! << 24) |
          (SBOX[(t >>> 16) & 0xff]! << 16) |
          (SBOX[(t >>> 8) & 0xff]! << 8) |
          SBOX[t & 0xff]!;
      t ^= (RCON[i/4 - 1]! << 24);
    }
    w[i] = (w[i-4]! ^ t) >>> 0;
  }
  return w;
}

/** Encrypt a single 16-byte block with AES-128 */
function aes128EncryptBlock(block: Uint8Array, w: Uint32Array, out: Uint8Array, outOff: number): void {
  // Load block as 4 words (column-major)
  let s0 = (block[0]! << 24) | (block[1]! << 16) | (block[2]! << 8) | block[3]!;
  let s1 = (block[4]! << 24) | (block[5]! << 16) | (block[6]! << 8) | block[7]!;
  let s2 = (block[8]! << 24) | (block[9]! << 16) | (block[10]! << 8) | block[11]!;
  let s3 = (block[12]! << 24) | (block[13]! << 16) | (block[14]! << 8) | block[15]!;

  // Round 0: AddRoundKey
  s0 ^= w[0]!;
  s1 ^= w[1]!;
  s2 ^= w[2]!;
  s3 ^= w[3]!;

  // Rounds 1-9
  for (let round = 1; round < 10; round++) {
    // SubBytes + ShiftRows + MixColumns
    const t0 = (SBOX[(s0 >>> 24) & 0xff]! << 24) |
               (SBOX[(s1 >>> 16) & 0xff]! << 16) |
               (SBOX[(s2 >>> 8) & 0xff]! << 8) |
               SBOX[s3 & 0xff]!;
    const t1 = (SBOX[(s1 >>> 24) & 0xff]! << 24) |
               (SBOX[(s2 >>> 16) & 0xff]! << 16) |
               (SBOX[(s3 >>> 8) & 0xff]! << 8) |
               SBOX[s0 & 0xff]!;
    const t2 = (SBOX[(s2 >>> 24) & 0xff]! << 24) |
               (SBOX[(s3 >>> 16) & 0xff]! << 16) |
               (SBOX[(s0 >>> 8) & 0xff]! << 8) |
               SBOX[s1 & 0xff]!;
    const t3 = (SBOX[(s3 >>> 24) & 0xff]! << 24) |
               (SBOX[(s0 >>> 16) & 0xff]! << 16) |
               (SBOX[(s1 >>> 8) & 0xff]! << 8) |
               SBOX[s2 & 0xff]!;

    // MixColumns
    s0 = uint32FromBytes([
      gfMul2((t0 >>> 24) & 0xff) ^ gfMul3((t1 >>> 24) & 0xff) ^ ((t2 >>> 24) & 0xff) ^ ((t3 >>> 24) & 0xff),
      gfMul2((t0 >>> 16) & 0xff) ^ gfMul3((t1 >>> 16) & 0xff) ^ ((t2 >>> 16) & 0xff) ^ ((t3 >>> 16) & 0xff),
      gfMul2((t0 >>> 8) & 0xff) ^ gfMul3((t1 >>> 8) & 0xff) ^ ((t2 >>> 8) & 0xff) ^ ((t3 >>> 8) & 0xff),
      gfMul2(t0 & 0xff) ^ gfMul3(t1 & 0xff) ^ (t2 & 0xff) ^ (t3 & 0xff),
    ]);
    s1 = uint32FromBytes([
      gfMul2((t1 >>> 24) & 0xff) ^ gfMul3((t2 >>> 24) & 0xff) ^ ((t3 >>> 24) & 0xff) ^ ((t0 >>> 24) & 0xff),
      gfMul2((t1 >>> 16) & 0xff) ^ gfMul3((t2 >>> 16) & 0xff) ^ ((t3 >>> 16) & 0xff) ^ ((t0 >>> 16) & 0xff),
      gfMul2((t1 >>> 8) & 0xff) ^ gfMul3((t2 >>> 8) & 0xff) ^ ((t3 >>> 8) & 0xff) ^ ((t0 >>> 8) & 0xff),
      gfMul2(t1 & 0xff) ^ gfMul3(t2 & 0xff) ^ (t3 & 0xff) ^ (t0 & 0xff),
    ]);
    s2 = uint32FromBytes([
      gfMul2((t2 >>> 24) & 0xff) ^ gfMul3((t3 >>> 24) & 0xff) ^ ((t0 >>> 24) & 0xff) ^ ((t1 >>> 24) & 0xff),
      gfMul2((t2 >>> 16) & 0xff) ^ gfMul3((t3 >>> 16) & 0xff) ^ ((t0 >>> 16) & 0xff) ^ ((t1 >>> 16) & 0xff),
      gfMul2((t2 >>> 8) & 0xff) ^ gfMul3((t3 >>> 8) & 0xff) ^ ((t0 >>> 8) & 0xff) ^ ((t1 >>> 8) & 0xff),
      gfMul2(t2 & 0xff) ^ gfMul3(t3 & 0xff) ^ (t0 & 0xff) ^ (t1 & 0xff),
    ]);
    s3 = uint32FromBytes([
      gfMul2((t3 >>> 24) & 0xff) ^ gfMul3((t0 >>> 24) & 0xff) ^ ((t1 >>> 24) & 0xff) ^ ((t2 >>> 24) & 0xff),
      gfMul2((t3 >>> 16) & 0xff) ^ gfMul3((t0 >>> 16) & 0xff) ^ ((t1 >>> 16) & 0xff) ^ ((t2 >>> 16) & 0xff),
      gfMul2((t3 >>> 8) & 0xff) ^ gfMul3((t0 >>> 8) & 0xff) ^ ((t1 >>> 8) & 0xff) ^ ((t2 >>> 8) & 0xff),
      gfMul2(t3 & 0xff) ^ gfMul3(t0 & 0xff) ^ (t1 & 0xff) ^ (t2 & 0xff),
    ]);

    s0 ^= w[round*4]!;
    s1 ^= w[round*4+1]!;
    s2 ^= w[round*4+2]!;
    s3 ^= w[round*4+3]!;
  }

  // Round 10: SubBytes + ShiftRows (no MixColumns) + AddRoundKey
  out[outOff]     = SBOX[(s0 >>> 24) & 0xff]! ^ ((w[40]! >>> 24) & 0xff);
  out[outOff+1]   = SBOX[(s1 >>> 16) & 0xff]! ^ ((w[40]! >>> 16) & 0xff);
  out[outOff+2]   = SBOX[(s2 >>> 8) & 0xff]! ^ ((w[40]! >>> 8) & 0xff);
  out[outOff+3]   = SBOX[s3 & 0xff]! ^ (w[40]! & 0xff);
  out[outOff+4]   = SBOX[(s1 >>> 24) & 0xff]! ^ ((w[41]! >>> 24) & 0xff);
  out[outOff+5]   = SBOX[(s2 >>> 16) & 0xff]! ^ ((w[41]! >>> 16) & 0xff);
  out[outOff+6]   = SBOX[(s3 >>> 8) & 0xff]! ^ ((w[41]! >>> 8) & 0xff);
  out[outOff+7]   = SBOX[s0 & 0xff]! ^ (w[41]! & 0xff);
  out[outOff+8]   = SBOX[(s2 >>> 24) & 0xff]! ^ ((w[42]! >>> 24) & 0xff);
  out[outOff+9]   = SBOX[(s3 >>> 16) & 0xff]! ^ ((w[42]! >>> 16) & 0xff);
  out[outOff+10]  = SBOX[(s0 >>> 8) & 0xff]! ^ ((w[42]! >>> 8) & 0xff);
  out[outOff+11]  = SBOX[s1 & 0xff]! ^ (w[42]! & 0xff);
  out[outOff+12]  = SBOX[(s3 >>> 24) & 0xff]! ^ ((w[43]! >>> 24) & 0xff);
  out[outOff+13]  = SBOX[(s0 >>> 16) & 0xff]! ^ ((w[43]! >>> 16) & 0xff);
  out[outOff+14]  = SBOX[(s1 >>> 8) & 0xff]! ^ ((w[43]! >>> 8) & 0xff);
  out[outOff+15]  = SBOX[s2 & 0xff]! ^ (w[43]! & 0xff);
}

/** Multiply by 3 in GF(2^8) */
function gfMul3(n: number): number {
  return gfMul2(n) ^ n;
}

/** Pack 4 bytes into uint32 (big-endian) */
function uint32FromBytes(b: [number,number,number,number]): number {
  return ((b[0]! & 0xff) << 24) | ((b[1]! & 0xff) << 16) | ((b[2]! & 0xff) << 8) | (b[3]! & 0xff);
}

/**
 * AES-128-ECB encryption with PKCS7 padding (pure JS).
 * Works on both Node.js and Cloudflare Workers.
 */
export function aesEcbEncrypt(plaintext: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length !== 16) throw new Error("AES-128-ECB requires a 16-byte key");

  // PKCS7 padding
  const pad = 16 - (plaintext.length % 16);
  const paddedLen = plaintext.length + pad;
  const padded = new Uint8Array(paddedLen);
  padded.set(plaintext);
  padded.fill(pad, plaintext.length);

  const w = keyExpansion(key);
  const ciphertext = new Uint8Array(paddedLen);
  for (let i = 0; i < paddedLen; i += 16) {
    aes128EncryptBlock(padded.subarray(i, i + 16), w, ciphertext, i);
  }
  return ciphertext;
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