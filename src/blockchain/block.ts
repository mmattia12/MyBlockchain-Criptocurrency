import { Worker } from "worker_threads";
import { existsSync } from "fs";
import { sha256 } from "../crypto/hash.js";
import { Transaction } from "./Transaction.js";
import { join } from "path";

function getWorkerPath(): string {
  const jsPath = join(__dirname, "mining-worker.js");
  if (existsSync(jsPath)) return jsPath;
  return join(__dirname, "mining-worker.ts");
}

export class Block {
  index: number;
  timestamp: number;
  data: Transaction[];
  previousHash: string;
  nonce: number;
  hash: string;
  difficulty: string;

  private static currentWorker: Worker | null = null;
  private static cancelBuffer: SharedArrayBuffer | null = null;

  constructor(
    index: number,
    data: Transaction[],
    previousHash: string,
    timestamp: number = Date.now(),
    difficulty: string = "0000",
    skipMining: boolean = false
  ) {
    this.index = index;
    this.timestamp = timestamp;
    this.data = data;
    this.previousHash = previousHash;
    this.difficulty = difficulty;
    this.nonce = 0;
    this.hash = skipMining ? this.calculateHash() : this.mineBlock();
  }

  calculateHash(): string {
    return sha256(
      this.index +
      this.timestamp +
      JSON.stringify(this.data) +
      this.previousHash +
      this.nonce
    );
  }

  mineBlock(): string {
    while (true) {
      const hash = this.calculateHash();
      if (hash.startsWith(this.difficulty)) return hash;
      this.nonce++;
    }
  }

  async mineBlockAsync(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const workerPath = getWorkerPath();
      const buffer = new SharedArrayBuffer(4);
      const cancelArray = new Int32Array(buffer);

      Block.cancelBuffer = buffer;

      const worker = new Worker(workerPath);
      Block.currentWorker = worker;

      worker.postMessage({
        type: "mine",
        index: this.index,
        timestamp: this.timestamp,
        data: JSON.stringify(this.data),
        previousHash: this.previousHash,
        difficulty: this.difficulty,
        nonceStart: this.nonce,
        sharedBuffer: buffer,
        cancelIndex: 0,
      });

      worker.on("message", (msg: any) => {
        if (msg.type === "result") {
          this.nonce = msg.nonce;
          this.hash = msg.hash;
          this.cleanupWorker(worker);
          resolve();
        } else if (msg.type === "cancelled") {
          this.cleanupWorker(worker);
          reject(new Error("Mining cancelled"));
        }
      });

      worker.on("error", (err) => {
        this.cleanupWorker(worker);
        reject(err);
      });

      worker.on("exit", (code) => {
        if (Block.currentWorker === worker) {
          this.cleanupWorker(worker);
        }
        if (code !== 0 && Block.currentWorker === null) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }

  private cleanupWorker(worker: Worker): void {
    if (Block.currentWorker === worker) {
      Block.currentWorker = null;
      Block.cancelBuffer = null;
    }
    worker.removeAllListeners();
    worker.terminate().catch(() => {});
  }

  static cancelMining(): void {
    if (Block.cancelBuffer) {
      const cancelArray = new Int32Array(Block.cancelBuffer);
      Atomics.store(cancelArray, 0, 1);
    }
    if (Block.currentWorker) {
      setTimeout(() => {
        if (Block.currentWorker) {
          const w = Block.currentWorker;
          Block.currentWorker = null;
          Block.cancelBuffer = null;
          w.terminate().catch(() => {});
        }
      }, 200);
    }
  }
}
