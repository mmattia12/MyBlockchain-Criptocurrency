import { generateKeyPairSync, createSign, createVerify } from "crypto";
import { publicKeyToAddress } from "./address.js";

export class Wallet {
  public publicKey: string;
  private privateKey: string;
  public address: string;

  constructor(existingKeys?: { publicKey: string; privateKey: string }) {
    if (existingKeys) {
      this.publicKey = existingKeys.publicKey;
      this.privateKey = existingKeys.privateKey;
    } else {
      const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });

      this.publicKey = publicKey.export({
        type: "spki",
        format: "pem",
      }).toString();

      this.privateKey = privateKey.export({
        type: "pkcs8",
        format: "pem",
      }).toString();
    }

    this.address = publicKeyToAddress(this.publicKey);
  }

  getAddress(): string {
    return this.address;
  }

  getPrivateKey(): string {
    return this.privateKey;
  }

  sign(data: string): string {
    const sign = createSign("SHA256");
    sign.update(data);
    sign.end();

    return sign.sign(this.privateKey, "hex");
  }

  verify(data: string, signature: string, publicKey: string): boolean {
    const verify = createVerify("SHA256");
    verify.update(data);
    verify.end();

    return verify.verify(publicKey, signature, "hex");
  }

  toJSON(): { publicKey: string; privateKey: string; address: string } {
    return {
      publicKey: this.publicKey,
      privateKey: this.privateKey,
      address: this.address,
    };
  }

  static fromKeys(publicKey: string, privateKey: string): Wallet {
    return new Wallet({ publicKey, privateKey });
  }
}