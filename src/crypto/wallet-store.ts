import * as fs from "fs";
import * as path from "path";
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "crypto";
import { Wallet } from "./Wallet.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const ITERATIONS = 100000;
const DIGEST = "sha512";

interface EncryptedKey {
  salt: string;
  iv: string;
  authTag: string;
  data: string;
}

interface WalletEntry {
  name: string;
  address: string;
  publicKey: string;
  encryptedPrivateKey: EncryptedKey;
}

interface WalletFile {
  wallets: WalletEntry[];
}

export class WalletStore {
  private filePath: string;
  private wallets: Map<string, WalletEntry> = new Map();
  private cache: Map<string, Wallet> = new Map();

  constructor(dataDir: string = "./data") {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, "wallets.json");
    this.load();
  }

  private deriveKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  }

  private encryptPrivateKey(privateKey: string, password: string): EncryptedKey {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = this.deriveKey(password, salt);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(privateKey, "utf-8", "hex");
    encrypted += cipher.final("hex");
    return {
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      authTag: cipher.getAuthTag().toString("hex"),
      data: encrypted,
    };
  }

  private decryptPrivateKey(encrypted: EncryptedKey, password: string): string {
    const salt = Buffer.from(encrypted.salt, "hex");
    const iv = Buffer.from(encrypted.iv, "hex");
    const authTag = Buffer.from(encrypted.authTag, "hex");
    const key = this.deriveKey(password, salt);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted.data, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return decrypted;
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const data: WalletFile = JSON.parse(raw);
      for (const entry of data.wallets) {
        this.wallets.set(entry.name, entry);
      }
    } catch {
      this.wallets = new Map();
    }
  }

  private save(): void {
    const data: WalletFile = {
      wallets: Array.from(this.wallets.values()),
    };
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  createWallet(name: string, password: string): Wallet {
    if (this.wallets.has(name)) {
      throw new Error(`Wallet "${name}" already exists`);
    }

      const wallet = new Wallet();
      const encryptedPrivateKey = this.encryptPrivateKey(wallet.getPrivateKey(), password);

    const entry: WalletEntry = {
      name,
      address: wallet.address,
      publicKey: wallet.publicKey,
      encryptedPrivateKey,
    };

    this.wallets.set(name, entry);
    this.cache.set(name, wallet);
    this.save();

    return wallet;
  }

  loadWallet(name: string, password: string): Wallet | null {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const entry = this.wallets.get(name);
    if (!entry) return null;

    try {
      const privateKey = this.decryptPrivateKey(entry.encryptedPrivateKey, password);
      const wallet = Wallet.fromKeys(entry.publicKey, privateKey);
      this.cache.set(name, wallet);
      return wallet;
    } catch {
      return null;
    }
  }

  listWallets(): { name: string; address: string }[] {
    return Array.from(this.wallets.values()).map((e) => ({
      name: e.name,
      address: e.address,
    }));
  }

  getWalletEntry(name: string): WalletEntry | undefined {
    return this.wallets.get(name);
  }

  exportWallet(name: string, password: string): object | null {
    const entry = this.wallets.get(name);
    if (!entry) return null;
    try {
      const privateKey = this.decryptPrivateKey(entry.encryptedPrivateKey, password);
      return {
        name: entry.name,
        address: entry.address,
        publicKey: entry.publicKey,
        privateKey,
      };
    } catch {
      return null;
    }
  }

  importWallet(json: { name: string; publicKey: string; privateKey: string }, password: string): Wallet {
    if (this.wallets.has(json.name)) {
      throw new Error(`Wallet "${json.name}" already exists`);
    }

    const wallet = Wallet.fromKeys(json.publicKey, json.privateKey);
    const encryptedPrivateKey = this.encryptPrivateKey(wallet.getPrivateKey(), password);

    const entry: WalletEntry = {
      name: json.name,
      address: wallet.address,
      publicKey: wallet.publicKey,
      encryptedPrivateKey,
    };

    this.wallets.set(json.name, entry);
    this.cache.set(json.name, wallet);
    this.save();

    return wallet;
  }
}
