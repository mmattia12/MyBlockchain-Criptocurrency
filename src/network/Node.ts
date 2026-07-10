import * as net from "net";
import { Blockchain } from "../blockchain/Blockchain.js";
import { Transaction } from "../blockchain/Transaction.js";
import { Wallet } from "../crypto/Wallet.js";
import {
  NetworkMessage,
  createNewBlockMessage,
  createNewTransactionMessage,
  createSyncRequestMessage,
  createSyncResponseMessage,
  createMempoolRequestMessage,
  createMempoolResponseMessage
} from "./Message.js";
import { Block } from "../blockchain/block.js";

interface PeerAddress {
  host: string;
  port: number;
}

export class Node {
  private blockchain: Blockchain;
  private nodeId: string;
  private port: number;
  private wallet: Wallet;

  private server: net.Server | null = null;
  private peers: Map<string, net.Socket> = new Map();
  private peerAddresses: PeerAddress[] = [];
  private incomingSockets: net.Socket[] = [];

  private seenBlocks: Set<string> = new Set();
  private isMining: boolean = false;

  constructor(port: number, wallet: Wallet, peerAddresses: PeerAddress[] = []) {
    this.port = port;
    this.nodeId = `Node-${port}`;
    this.wallet = wallet;
    this.blockchain = new Blockchain();
    this.peerAddresses = peerAddresses;
  }

  async start(): Promise<void> {
    console.log(`\n[${this.nodeId}] Avvio nodo sulla porta ${this.port}...`);

    this.setupServer();

    await this.waitForServerReady();

    await this.connectToPeers();

    console.log(`[${this.nodeId}] Nodo avviato con ${this.peers.size} peer connessi`);
  }

  private setupServer(): void {
    this.server = net.createServer((socket: net.Socket) => {
      const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
      console.log(`[${this.nodeId}] Connessione in ingresso da ${remoteAddress}`);

      this.incomingSockets.push(socket);
      this.handleConnection(socket);
    });

    this.server.listen(this.port, "127.0.0.1", () => {
      console.log(`[${this.nodeId}] Server in ascolto sulla porta ${this.port}`);
    });

    this.server.on("error", (err) => {
      console.error(`[${this.nodeId}] Errore server:`, err.message);
    });
  }

  private waitForServerReady(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async connectToPeers(): Promise<void> {
    const connectionPromises = this.peerAddresses.map((peer) =>
      this.connectToPeer(peer)
    );

    const results = await Promise.allSettled(connectionPromises);

    const connected = results.filter((r) => r.status === "fulfilled").length;
    console.log(`[${this.nodeId}] Connessioni stabilite: ${connected}/${this.peerAddresses.length}`);
  }

  private connectToPeer(peer: PeerAddress): Promise<void> {
    return new Promise((resolve) => {
      const peerKey = `${peer.host}:${peer.port}`;

      if (this.peers.has(peerKey)) {
        resolve();
        return;
      }

      const socket = net.createConnection(
        {
          host: peer.host,
          port: peer.port,
        },
        () => {
          console.log(`[${this.nodeId}] Connesso a ${peerKey}`);
          this.peers.set(peerKey, socket);
          this.handleConnection(socket);
          this.sendMessageToSocket(socket, createMempoolRequestMessage(this.nodeId));
          resolve();
        }
      );

      socket.setTimeout(30000);
      socket.on("error", (err) => {
        console.log(`[${this.nodeId}] Impossibile connettersi a ${peerKey}: ${err.message}`);
        resolve();
      });

      socket.on("timeout", () => {
        console.log(`[${this.nodeId}] Timeout connessione a ${peerKey}`);
        socket.destroy();
      });
    });
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = "";

    socket.on("data", (data: Buffer) => {
      buffer += data.toString();

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message: NetworkMessage = JSON.parse(line);
            this.handleMessage(message, socket);
          } catch (err) {
            console.error(`[${this.nodeId}] Errore parsing messaggio:`, err);
          }
        }
      }
    });

    socket.on("end", () => {
      console.log(`[${this.nodeId}] Connessione chiusa`);
      const idx = this.incomingSockets.indexOf(socket);
      if (idx !== -1) this.incomingSockets.splice(idx, 1);

      for (const [key, s] of this.peers) {
        if (s === socket) {
          this.peers.delete(key);
          break;
        }
      }
    });

    socket.on("error", (err) => {
      console.error(`[${this.nodeId}] Errore socket:`, err.message);
    });
  }

  private handleMessage(message: NetworkMessage, socket: net.Socket): void {
    if (message.nodeId === this.nodeId) {
      return;
    }

    console.log(`[${this.nodeId}] Messaggio ricevuto: ${message.type} da ${message.nodeId}`);

    switch (message.type) {
      case "new-block":
        this.handleNewBlock(this.reviveBlock(message.payload.block), socket);
        break;
      case "new-transaction":
        this.handleNewTransaction(this.reviveTransaction(message.payload.transaction));
        break;
      case "sync-request":
        this.handleSyncRequest(message.payload.currentChainLength, socket);
        break;
      case "sync-response":
        this.handleSyncResponse(message.payload.blocks.map((b: Block) => this.reviveBlock(b)));
        break;
      case "mempool-request":
        this.handleMempoolRequest(socket);
        break;
      case "mempool-response":
        this.handleMempoolResponse(message.payload.transactions.map((t: Transaction) => this.reviveTransaction(t)));
        break;
      default:
        console.warn(`[${this.nodeId}] Tipo messaggio sconosciuto: ${(message as { type: string }).type}`);
    }
  }

  private reviveTransaction(rawTransaction: Transaction): Transaction {
    const transaction = new Transaction(rawTransaction.inputs, rawTransaction.outputs);
    transaction.id = rawTransaction.id;
    return transaction;
  }

  private reviveBlock(rawBlock: Block): Block {
    const transactions = rawBlock.data.map((transaction) => this.reviveTransaction(transaction));
    const block = new Block(
      rawBlock.index,
      transactions,
      rawBlock.previousHash,
      rawBlock.timestamp,
      rawBlock.difficulty,
      true
    );

    block.nonce = rawBlock.nonce;
    block.hash = rawBlock.hash;
    return block;
  }

  private handleNewBlock(block: Block, sourceSocket: net.Socket): void {
    const blockHash = block.hash;

    if (this.seenBlocks.has(blockHash)) {
      console.log(`[${this.nodeId}] Blocco ${blockHash} già visto, ignorato`);
      return;
    }

    this.seenBlocks.add(blockHash);

    const accepted = this.blockchain.registerBlock(block);

    if (accepted) {
      console.log(`[${this.nodeId}] ✓ Blocco ${block.index} aggiunto alla catena`);

      if (this.isMining) {
        console.log(`[${this.nodeId}] Blocco ricevuto durante mining, annullamento mining in corso...`);
        this.blockchain.cancelMining();
        this.isMining = false;
      }

      this.broadcastToAllPeers(
        createNewBlockMessage(this.nodeId, block),
        sourceSocket
      );
    } else {
      console.log(`[${this.nodeId}] Blocco ${block.index} non accettato (fork o orfano)`);
    }
  }

  private handleNewTransaction(transaction: Transaction): void {
    const accepted = this.blockchain.addTransaction(transaction);

    if (accepted) {
      console.log(
        `[${this.nodeId}] ✓ Transazione ${transaction.id.slice(0, 8)}... aggiunta al mempool`
      );

      this.broadcastToAllPeers(
        createNewTransactionMessage(this.nodeId, transaction)
      );
    } else {
      console.log(
        `[${this.nodeId}] ✗ Transazione ${transaction.id.slice(0, 8)}... rifiutata`
      );
    }
  }

  private handleSyncRequest(remoteChainLength: number, socket: net.Socket): void {
    const ourLength = this.blockchain.chain.length;

    if (ourLength > remoteChainLength) {
      console.log(
        `[${this.nodeId}] Sync richiesto: nostra catena ${ourLength} > remota ${remoteChainLength}`
      );

      const blocksToSend = this.blockchain.chain.slice(remoteChainLength);
      this.sendMessageToSocket(
        socket,
        createSyncResponseMessage(this.nodeId, blocksToSend)
      );
    }
  }

  private handleSyncResponse(blocks: Block[]): void {
    console.log(`[${this.nodeId}] Ricevuto ${blocks.length} blocchi per sync`);

    for (const block of blocks) {
      if (this.seenBlocks.has(block.hash)) {
        continue;
      }
      this.seenBlocks.add(block.hash);

      const accepted = this.blockchain.registerBlock(block);

      if (accepted) {
        console.log(`[${this.nodeId}] ✓ Blocco ${block.index} sincronizzato`);
      } else {
        console.log(`[${this.nodeId}] Blocco ${block.index} non accettato durante sync`);
      }
    }
  }

  private handleMempoolRequest(socket: net.Socket): void {
    const transactions = this.blockchain.mempool;
    console.log(`[${this.nodeId}] Invio ${transactions.length} transazioni pendenti a peer`);

    this.sendMessageToSocket(
      socket,
      createMempoolResponseMessage(this.nodeId, transactions)
    );
  }

  private handleMempoolResponse(transactions: Transaction[]): void {
    let acceptedCount = 0;

    for (const tx of transactions) {
      const accepted = this.blockchain.addTransaction(tx);
      if (accepted) acceptedCount++;
    }

    console.log(
      `[${this.nodeId}] Sync mempool completato: ${acceptedCount}/${transactions.length} nuove tx`
    );
  }

  private requestSync(): void {
    const message = createSyncRequestMessage(
      this.nodeId,
      this.blockchain.chain.length
    );
    this.broadcastToAllPeers(message);
  }

  async addTransactionAndBroadcast(transaction: Transaction): Promise<boolean> {
    const accepted = this.blockchain.addTransaction(transaction);

    if (accepted) {
      console.log(`[${this.nodeId}] ✓ Transazione creata e propagata`);
      this.broadcastToAllPeers(
        createNewTransactionMessage(this.nodeId, transaction)
      );
    }

    return accepted;
  }

  async minePendingTransactions(): Promise<Block> {
    if (this.isMining) {
      throw new Error("Mining già in corso");
    }

    this.isMining = true;
    console.log(`\n[${this.nodeId}] Inizio mining asincrono...`);

    try {
      await this.blockchain.minePendingTransactionsAsync(this.wallet.getAddress());
    } catch (err: any) {
      this.isMining = false;
      if (err.message === "Mining cancelled") {
        console.log(`[${this.nodeId}] Mining annullato`);
        throw err;
      }
      throw err;
    }

    this.isMining = false;
    const newBlock = this.blockchain.chain[this.blockchain.chain.length - 1];

    console.log(`[${this.nodeId}] ✓ Blocco minato: ${newBlock.index}`);

    this.seenBlocks.add(newBlock.hash);

    this.broadcastToAllPeers(createNewBlockMessage(this.nodeId, newBlock));

    return newBlock;
  }

  private sendMessageToSocket(socket: net.Socket, message: NetworkMessage): void {
    try {
      socket.write(JSON.stringify(message) + "\n");
    } catch (err) {
      console.error(`[${this.nodeId}] Errore invio messaggio:`, err);
    }
  }

  private broadcastToAllPeers(
    message: NetworkMessage,
    excludeSocket?: net.Socket
  ): void {
    for (const socket of this.peers.values()) {
      if (socket !== excludeSocket && socket.writable) {
        this.sendMessageToSocket(socket, message);
      }
    }

    for (const socket of this.incomingSockets) {
      if (socket !== excludeSocket && socket.writable) {
        this.sendMessageToSocket(socket, message);
      }
    }
  }

  getBlockchain(): Blockchain {
    return this.blockchain;
  }

  getBalance(address: string): number {
    return this.blockchain.getBalance(address);
  }

  getNodeId(): string {
    return this.nodeId;
  }

  isMiningInProgress(): boolean {
    return this.isMining;
  }

  async shutdown(): Promise<void> {
    console.log(`[${this.nodeId}] Chiusura nodo...`);

    if (this.isMining) {
      this.blockchain.cancelMining();
      this.isMining = false;
    }

    for (const socket of this.peers.values()) {
      socket.destroy();
    }

    for (const socket of this.incomingSockets) {
      socket.destroy();
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
    }

    console.log(`[${this.nodeId}] Nodo chiuso`);
  }
}
