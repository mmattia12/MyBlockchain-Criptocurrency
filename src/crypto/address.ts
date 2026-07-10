import { createHash } from "crypto";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(buffer: Buffer): string {
  let num = 0n;
  for (const byte of buffer) {
    num = (num << 8n) + BigInt(byte);
  }

  const base = 58n;
  const result: string[] = [];

  while (num > 0n) {
    const remainder = Number(num % base);
    result.push(BASE58_ALPHABET[remainder]);
    num = num / base;
  }

  let leadingOnes = 0;
  for (const byte of buffer) {
    if (byte === 0) leadingOnes++;
    else break;
  }

  while (leadingOnes-- > 0) {
    result.push("1");
  }

  return result.reverse().join("");
}

export function base58Decode(address: string): Buffer {
  let num = 0n;
  const base = 58n;

  for (const char of address) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid Base58 character: ${char}`);
    num = num * base + BigInt(idx);
  }

  let hex = num.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;

  const leadingOnes = address.match(/^1*/)?.[0]?.length || 0;
  const prefix = Buffer.alloc(leadingOnes, 0);

  return Buffer.concat([prefix, Buffer.from(hex, "hex")]);
}

export function publicKeyToAddress(publicKey: string): string {
  const sha256Hash = createHash("sha256").update(publicKey, "utf-8").digest();

  const hash160 = createHash("ripemd160").update(sha256Hash).digest();

  const versioned = Buffer.concat([Buffer.from([0x00]), hash160]);

  const checksum = createHash("sha256")
    .update(createHash("sha256").update(versioned).digest())
    .digest()
    .subarray(0, 4);

  return base58Encode(Buffer.concat([versioned, checksum]));
}
