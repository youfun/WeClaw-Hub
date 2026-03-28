import { createDecipheriv } from "node:crypto";
import type { ImageItem } from "./types.ts";

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