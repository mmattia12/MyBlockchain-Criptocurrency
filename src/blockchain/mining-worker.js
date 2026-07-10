// Duplicato CommonJS di mining-worker.ts.
// Necessario perché worker_threads carica il file in un context Node.js
// separato che non passa attraverso tsx/ts-node.
// In produzione (dopo build tsc), il .ts viene compilato a .js in dist/.
const { parentPort } = require("worker_threads");
const { createHash } = require("crypto");

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function calculateHash(index, timestamp, dataJson, previousHash, nonce) {
  return sha256(index + timestamp + dataJson + previousHash + nonce);
}

if (parentPort) {
  parentPort.on("message", (task) => {
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
        parentPort.postMessage({ type: "result", nonce, hash });
        return;
      }

      nonce++;

      if (nonce % 1000 === 0 && cancelArray) {
        if (Atomics.load(cancelArray, cancelIndex || 0) === 1) {
          parentPort.postMessage({ type: "cancelled" });
          return;
        }
      }
    }
  });
}
