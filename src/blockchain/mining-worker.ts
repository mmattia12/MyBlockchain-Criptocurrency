import { parentPort } from "worker_threads";
import { createHash } from "crypto";

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function calculateHash(
  index: number,
  timestamp: number,
  dataJson: string,
  previousHash: string,
  nonce: number
): string {
  return sha256(index + timestamp + dataJson + previousHash + nonce);
}

if (parentPort) {
  parentPort.on("message", (task: any) => {
    if (task.type !== "mine") return;

    const {
      index,
      timestamp,
      data,
      previousHash,
      difficulty,
      nonceStart,
      sharedBuffer,
      cancelIndex,
    } = task;

    let nonce = nonceStart || 0;
    const cancelArray = sharedBuffer ? new Int32Array(sharedBuffer) : null;

    while (true) {
      const hash = calculateHash(index, timestamp, data, previousHash, nonce);

      if (hash.startsWith(difficulty)) {
        parentPort!.postMessage({ type: "result", nonce, hash });
        return;
      }

      nonce++;

      if (nonce % 1000 === 0 && cancelArray) {
        if (Atomics.load(cancelArray, cancelIndex || 0) === 1) {
          parentPort!.postMessage({ type: "cancelled" });
          return;
        }
      }
    }
  });
}
