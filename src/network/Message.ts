import { Block } from "../blockchain/block.js";
import { Transaction } from "../blockchain/Transaction.js";

export type NetworkMessage =
  | { type: "new-block"; nodeId: string; timestamp: number; payload: { block: Block } }
  | { type: "new-transaction"; nodeId: string; timestamp: number; payload: { transaction: Transaction } }
  | { type: "sync-request"; nodeId: string; timestamp: number; payload: { currentChainLength: number } }
  | { type: "sync-response"; nodeId: string; timestamp: number; payload: { blocks: Block[] } }
  | { type: "mempool-request"; nodeId: string; timestamp: number; payload: { nodeId: string } }
  | { type: "mempool-response"; nodeId: string; timestamp: number; payload: { transactions: Transaction[] } };

export function createNewBlockMessage(nodeId: string, block: Block): NetworkMessage {
  return {
    type: "new-block",
    nodeId,
    timestamp: Date.now(),
    payload: { block }
  };
}

export function createNewTransactionMessage(nodeId: string, transaction: Transaction): NetworkMessage {
  return {
    type: "new-transaction",
    nodeId,
    timestamp: Date.now(),
    payload: { transaction }
  };
}

export function createSyncRequestMessage(nodeId: string, currentChainLength: number): NetworkMessage {
  return {
    type: "sync-request",
    nodeId,
    timestamp: Date.now(),
    payload: { currentChainLength }
  };
}

export function createSyncResponseMessage(nodeId: string, blocks: Block[]): NetworkMessage {
  return {
    type: "sync-response",
    nodeId,
    timestamp: Date.now(),
    payload: { blocks }
  };
}

export function createMempoolRequestMessage(nodeId: string): NetworkMessage {
  return {
    type: "mempool-request",
    nodeId,
    timestamp: Date.now(),
    payload: { nodeId }
  };
}

export function createMempoolResponseMessage(nodeId: string, transactions: Transaction[]): NetworkMessage {
  return {
    type: "mempool-response",
    nodeId,
    timestamp: Date.now(),
    payload: { transactions }
  };
}
