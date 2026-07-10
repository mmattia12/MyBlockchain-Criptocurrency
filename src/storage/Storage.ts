import * as fs from "fs";
import * as path from "path";
import { Block } from "../blockchain/block.js";
import { Transaction } from "../blockchain/Transaction.js";
import { UTXO } from "../blockchain/UTXOSet.js";
import { CurrencyConfig, DEFAULT_CURRENCY } from "../blockchain/Currency.js";

interface PersistedData {
    currency: CurrencyConfig;
    blocks: {
        index: number;
        timestamp: number;
        data: {
            id: string;
            inputs: { txId: string; index: number; signature: string; publicKey: string }[];
            outputs: { index: number; owner: string; amount: number }[];
        }[];
        previousHash: string;
        nonce: number;
        hash: string;
        difficulty: string;
    }[];
    utxos: UTXO[];
    mempool: {
        id: string;
        inputs: { txId: string; index: number; signature: string; publicKey: string }[];
        outputs: { index: number; owner: string; amount: number }[];
    }[];
}

export class Storage {
    private filePath: string;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private pendingSave: boolean = false;

    constructor(dataDir: string = "./data") {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.filePath = path.join(dataDir, "blockchain.json");
    }

    save(
        blocks: Block[],
        utxos: UTXO[],
        mempool: Transaction[],
        currency: CurrencyConfig
    ): void {
        const data: PersistedData = {
            currency,
            blocks: blocks.map((b) => ({
                index: b.index,
                timestamp: b.timestamp,
                data: b.data.map((tx) => ({
                    id: tx.id,
                    inputs: tx.inputs.map((i) => ({
                        txId: i.txId,
                        index: i.index,
                        signature: i.signature,
                        publicKey: i.publicKey
                    })),
                    outputs: tx.outputs.map((o) => ({
                        index: o.index,
                        owner: o.owner,
                        amount: o.amount
                    }))
                })),
                previousHash: b.previousHash,
                nonce: b.nonce,
                hash: b.hash,
                difficulty: b.difficulty
            })),
            utxos,
            mempool: mempool.map((tx) => ({
                id: tx.id,
                inputs: tx.inputs.map((i) => ({
                    txId: i.txId,
                    index: i.index,
                    signature: i.signature,
                    publicKey: i.publicKey
                })),
                outputs: tx.outputs.map((o) => ({
                    index: o.index,
                    owner: o.owner,
                    amount: o.amount
                }))
            }))
        };

        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    }

    saveAsync(
        blocks: Block[],
        utxos: UTXO[],
        mempool: Transaction[],
        currency: CurrencyConfig
    ): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.pendingSave = true;
        this.saveTimeout = setTimeout(() => {
            this.save(blocks, utxos, mempool, currency);
            this.pendingSave = false;
            this.saveTimeout = null;
        }, 200);
    }

    load(): {
        blocks: Block[];
        utxos: UTXOSetImport;
        mempool: Transaction[];
        currency: CurrencyConfig;
    } | null {
        if (!fs.existsSync(this.filePath)) {
            return null;
        }

        const raw = fs.readFileSync(this.filePath, "utf-8");
        const data: PersistedData = JSON.parse(raw);

        const blocks = data.blocks.map((b) => {
            const transactions = b.data.map((txData) => {
                const tx = new Transaction(txData.inputs, txData.outputs);
                tx.id = txData.id;
                return tx;
            });
            const block = new Block(
                b.index,
                transactions,
                b.previousHash,
                b.timestamp,
                b.difficulty,
                true
            );
            block.nonce = b.nonce;
            block.hash = b.hash;
            return block;
        });

        return {
            blocks,
            utxos: data.utxos,
            mempool: data.mempool.map((txData) => {
                const tx = new Transaction(txData.inputs, txData.outputs);
                tx.id = txData.id;
                return tx;
            }),
            currency: data.currency
        };
    }

    getPath(): string {
        return this.filePath;
    }
}

export type UTXOSetImport = Array<{
    txId: string;
    index: number;
    owner: string;
    amount: number;
}>;
