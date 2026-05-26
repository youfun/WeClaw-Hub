import { createCipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aesEcbDecrypt, buildCdnDownloadUrl, parseAesKey } from "../cdn.ts";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe("parseAesKey", () => {
  it("parses 32-char hex keys into 16 bytes", () => {
    const key = parseAesKey("000102030405060708090a0b0c0d0e0f");
    expect(hex(key)).toBe("000102030405060708090a0b0c0d0e0f");
  });

  it("parses base64 encoded raw 16-byte keys", () => {
    const raw = Uint8Array.from({ length: 16 }, (_, index) => index);
    const key = parseAesKey(bytesToBase64(raw));
    expect(hex(key)).toBe("000102030405060708090a0b0c0d0e0f");
  });

  it("throws for invalid key formats", () => {
    expect(() => parseAesKey("not-a-key")).toThrow(/invalid AES key|decoded AES key/);
  });
});

describe("aesEcbDecrypt", () => {
  it("decrypts a known AES-128-ECB vector", () => {
    const key = parseAesKey("000102030405060708090a0b0c0d0e0f");
    const ciphertext = Uint8Array.from(Buffer.from("69c4e0d86a7b0430d8cdb78070b4c55a", "hex"));

    const plaintext = aesEcbDecrypt(ciphertext, key);

    expect(hex(plaintext)).toBe("00112233445566778899aabbccddeeff");
  });

  it("removes PKCS7 padding after decryption", () => {
    const key = parseAesKey("000102030405060708090a0b0c0d0e0f");
    const cipher = createCipheriv("aes-128-ecb", Buffer.from(key), Buffer.alloc(0));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from("hello", "utf8")),
      cipher.final(),
    ]);

    const plaintext = aesEcbDecrypt(new Uint8Array(ciphertext), key);

    expect(new TextDecoder().decode(plaintext)).toBe("hello");
  });
});

describe("buildCdnDownloadUrl", () => {
  it("encodes encryptedQueryParam into the CDN download URL", () => {
    expect(buildCdnDownloadUrl("a+b/c=?")).toBe(
      "https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=a%2Bb%2Fc%3D%3F",
    );
  });
});