import { Block } from "./block.js";
import { Transaction } from "./Transaction.js";
import { createVerify } from "crypto";
import { UTXOSet, UTXO } from "./UTXOSet.js";
import { CurrencyConfig, DEFAULT_CURRENCY } from "./Currency.js";
import { Storage } from "../storage/Storage.js";
import { publicKeyToAddress } from "../crypto/address.js";

export class Blockchain {
    chain: Block[];
    mempool: Transaction[];
    utxos: UTXOSet;
    private nextGenesisTxId: number;
    private readonly miningReward: number;
    private readonly currency: CurrencyConfig;
    private storage: Storage | null = null;

    private utxoSnapshots: UTXOSet[] = [];
    private altBlocks: Map<string, Block> = new Map();
    private orphanBlocks: Map<string, Block> = new Map();
    private miningCancelled: boolean = false;

    constructor(currency: CurrencyConfig = DEFAULT_CURRENCY) {
        this.currency = currency;
        this.miningReward = currency.miningReward;
        this.mempool = [];
        this.utxos = new UTXOSet();
        this.nextGenesisTxId = 0;

        this.storage = null;
        this.chain = [this.createGenesisBlock()];
        this.utxoSnapshots[0] = new UTXOSet();
    }

    enablePersistence(dataDir: string = "./data"): void {
        this.storage = new Storage(dataDir);
        const saved = this.storage.load();
        if (saved) {
            this.chain = saved.blocks;
            this.utxos = new UTXOSet();
            for (const utxo of saved.utxos) {
                this.utxos.add(utxo);
            }
            this.mempool = saved.mempool;
            this.rebuildSnapshots();
        }
    }

    private rebuildSnapshots(): void {
        this.utxoSnapshots = [];
        const working = new UTXOSet();
        for (let i = 0; i <= this.chain.length; i++) {
            this.utxoSnapshots[i] = working.clone();
            if (i < this.chain.length) {
                for (const tx of this.chain[i].data) {
                    for (const input of tx.inputs) {
                        working.remove(input.txId, input.index);
                    }
                    tx.outputs.forEach((output, index) => {
                        working.add({
                            txId: tx.id,
                            index,
                            owner: output.owner,
                            amount: output.amount
                        });
                    });
                }
            }
        }
    }

    private persist(): void {
        if (this.storage) {
            this.storage.saveAsync(
                this.chain,
                this.utxos.toArray(),
                this.mempool,
                this.currency
            );
        }
    }

    createGenesisBlock(): Block {
        return new Block(0, [], "0", 0, this.currency.initialDifficulty, false);
    }

    getLatestBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    addBlock(data: Transaction[]): void {
        const previousBlock = this.getLatestBlock();
        const newBlock = new Block(
            previousBlock.index + 1,
            data,
            previousBlock.hash,
            Date.now(),
            this.getCurrentDifficulty()
        );
        this.chain.push(newBlock);
        this.persist();
    }

    getCurrentDifficulty(): string {
        const interval = this.currency.difficultyAdjustmentInterval;
        const chainLen = this.chain.length;

        if (chainLen < 2 || chainLen % interval !== 0) {
            return this.chain[chainLen - 1]?.difficulty ?? this.currency.initialDifficulty;
        }

        const startIdx = Math.max(1, chainLen - interval);
        const startBlock = this.chain[startIdx];
        const endBlock = this.chain[chainLen - 1];
        const timeSpent = endBlock.timestamp - startBlock.timestamp;
        const targetTime = interval * this.currency.targetBlockTimeSeconds * 1000;
        const currentDiff = endBlock.difficulty;

        if (timeSpent < targetTime * 0.75) {
            return currentDiff + "0";
        } else if (timeSpent > targetTime * 1.25 && currentDiff.length > 1) {
            return currentDiff.slice(0, -1);
        }

        return currentDiff;
    }

    applyConfirmedTransactions(transactions: Transaction[]): void {
        this.utxoSnapshots[this.chain.length] = this.utxos.clone();

        const workingUtxos = this.utxos.clone();

        for (const tx of transactions) {
            this.applyTransaction(tx, workingUtxos);
        }

        this.utxos = workingUtxos;

        const confirmedIds = new Set(transactions.map((tx) => tx.id));
        this.mempool = this.mempool.filter((tx) => !confirmedIds.has(tx.id));

        this.persist();
    }

    private getAvailableUtxos(): UTXOSet {
        const spentInputs = new Set<string>();

        for (const pendingTx of this.mempool) {
            for (const input of pendingTx.inputs) {
                spentInputs.add(`${input.txId}:${input.index}`);
            }
        }

        return this.utxos.getAvailable(spentInputs);
    }

    private applyTransaction(tx: Transaction, utxoPool: UTXOSet): void {
        for (const input of tx.inputs) {
            utxoPool.remove(input.txId, input.index);
        }

        tx.outputs.forEach((output, index) => {
            utxoPool.add({
                txId: tx.id,
                index,
                owner: output.owner,
                amount: output.amount
            });
        });
    }

    seedUtxo(owner: string, amount: number): UTXO {
        const utxo: UTXO = {
            txId: `genesis-${this.nextGenesisTxId++}`,
            index: 0,
            owner,
            amount
        };

        this.utxos.add(utxo);
        this.persist();
        return utxo;
    }

    private isCoinbaseTransaction(tx: Transaction): boolean {
        return tx.inputs.length === 0 && tx.outputs.length === 1;
    }

    private calculateTransactionFee(
        tx: Transaction,
        utxoSet: UTXOSet
    ): number | null {
        if (this.isCoinbaseTransaction(tx)) {
            return 0;
        }

        let inputSum = 0;
        let outputSum = 0;
        const seenInputs = new Set<string>();

        for (const input of tx.inputs) {
            const key = `${input.txId}:${input.index}`;

            if (seenInputs.has(key)) {
                return null;
            }

            seenInputs.add(key);

            const utxo = utxoSet.find(input.txId, input.index);
            if (!utxo) {
                return null;
            }

            if (utxo.owner !== publicKeyToAddress(input.publicKey)) {
                return null;
            }

            if (!this.verifyTransaction(tx.getSigningData(), input.signature, input.publicKey)) {
                return null;
            }

            inputSum += utxo.amount;
        }

        for (const output of tx.outputs) {
            if (!Number.isFinite(output.amount) || output.amount <= 0) {
                return null;
            }

            outputSum += output.amount;
        }

        const fee = inputSum - outputSum;
        return fee >= 0 ? fee : null;
    }

    private createCoinbaseTransaction(minerAddress: string, amount: number): Transaction {
        return new Transaction([], [
            {
                index: 0,
                owner: minerAddress,
                amount
            }
        ]);
    }

    verifyTransaction(
        data: string,
        signature: string,
        publicKey: string
    ): boolean {
        if (!signature) return false;

        const verify = createVerify("SHA256");
        verify.update(data);
        verify.end();

        return verify.verify(publicKey, signature, "hex");
    }

    verifyBlockPow(block: Block): boolean {
        if (!block.hash.startsWith(block.difficulty)) {
            return false;
        }
        if (block.difficulty !== this.getCurrentDifficulty()) {
            return false;
        }
        return true;
    }

    validateBlockTransactions(block: Block, utxoSet?: UTXOSet): boolean {
        if (block.data.length === 0) return true;

        const workingUtxos = (utxoSet || this.utxos).clone();

        for (let i = 0; i < block.data.length; i++) {
            const tx = block.data[i];
            const isCoinbase = this.isCoinbaseTransaction(tx);

            if (isCoinbase && i !== block.data.length - 1) {
                return false;
            }

            if (!isCoinbase) {
                if (tx.inputs.length === 0) return false;

                const fee = this.calculateTransactionFee(tx, workingUtxos);
                if (fee === null) return false;
            }

            this.applyTransaction(tx, workingUtxos);
        }

        const coinbaseTx = block.data[block.data.length - 1];
        if (this.isCoinbaseTransaction(coinbaseTx)) {
            const totalOutput = coinbaseTx.outputs.reduce((sum, o) => sum + o.amount, 0);
            const expectedFees = this.calculateBlockFees(block);
            if (totalOutput > this.miningReward + expectedFees) {
                return false;
            }
        }

        return true;
    }

    private calculateBlockFees(block: Block): number {
        const workingUtxos = this.utxos.clone();
        let totalFees = 0;

        for (const tx of block.data) {
            if (this.isCoinbaseTransaction(tx)) continue;

            const inputSum = tx.inputs.reduce((sum, input) => {
                const utxo = workingUtxos.find(input.txId, input.index);
                return sum + (utxo ? utxo.amount : 0);
            }, 0);

            const outputSum = tx.outputs.reduce((sum, o) => sum + o.amount, 0);

            for (const input of tx.inputs) {
                workingUtxos.remove(input.txId, input.index);
            }
            tx.outputs.forEach((output, index) => {
                workingUtxos.add({ txId: tx.id, index, owner: output.owner, amount: output.amount });
            });

            totalFees += (inputSum - outputSum);
        }

        return totalFees;
    }

    registerBlock(block: Block): boolean {
        if (block.hash !== block.calculateHash()) {
            return false;
        }

        if (!this.verifyBlockPow(block)) {
            return false;
        }

        const tip = this.getLatestBlock();

        if (block.previousHash === tip.hash && block.index === tip.index + 1) {
            if (!this.validateBlockTransactions(block)) {
                return false;
            }

            this.applyConfirmedTransactions(block.data);
            this.chain.push(block);
            this.tryResolveAltBlocks();
            this.tryResolveOrphans();
            return true;
        }

        const parentIndex = this.chain.findIndex(b => b.hash === block.previousHash);
        if (parentIndex !== -1) {
            this.altBlocks.set(block.hash, block);
            this.tryReorg(parentIndex);
            return true;
        }

        this.orphanBlocks.set(block.previousHash, block);
        return false;
    }

    private tryResolveAltBlocks(): void {
        const tip = this.getLatestBlock();
        let found = true;

        while (found) {
            found = false;
            for (const [hash, block] of this.altBlocks) {
                if (block.previousHash === tip.hash && block.index === tip.index + 1) {
                    this.altBlocks.delete(hash);
                    if (this.validateBlockTransactions(block)) {
                        this.applyConfirmedTransactions(block.data);
                        this.chain.push(block);
                        found = true;
                    }
                    break;
                }
            }
        }
    }

    private tryResolveOrphans(): void {
        const remaining = new Map<string, Block>();
        for (const [parentHash, block] of this.orphanBlocks) {
            const parentInChain = this.chain.some(b => b.hash === parentHash);
            if (parentInChain) {
                this.registerBlock(block);
            } else {
                remaining.set(parentHash, block);
            }
        }
        this.orphanBlocks = remaining;
    }

    private tryReorg(forkPoint: number): void {
        const forkChain = this.buildLongestChain(forkPoint);
        const mainChainLength = this.chain.length - forkPoint - 1;

        if (forkChain.length > mainChainLength) {
            this.reorgToFork(forkChain, forkPoint);
            this.tryResolveAltBlocks();
            this.tryResolveOrphans();
        }
    }

    private buildLongestChain(startIndex: number): Block[] {
        const result: Block[] = [];
        const startHash = this.chain[startIndex].hash;
        let currentPrevHash = startHash;

        while (true) {
            const candidates: Block[] = [];
            for (const block of this.altBlocks.values()) {
                if (block.previousHash === currentPrevHash) {
                    candidates.push(block);
                }
            }

            if (candidates.length === 0) break;

            candidates.sort((a, b) => {
                if (a.index !== b.index) return a.index - b.index;
                return a.hash.localeCompare(b.hash);
            });

            const next = candidates[0];
            result.push(next);
            currentPrevHash = next.hash;
        }

        return result;
    }

    reorgToFork(forkBlocks: Block[], forkPoint: number): void {
        const discardedTxs: Transaction[] = [];
        for (let i = forkPoint + 1; i < this.chain.length; i++) {
            for (const tx of this.chain[i].data) {
                discardedTxs.push(tx);
            }
        }

        const newTxIds = new Set<string>();
        for (const block of forkBlocks) {
            for (const tx of block.data) {
                newTxIds.add(tx.id);
            }
        }

        this.utxos = this.utxoSnapshots[forkPoint + 1].clone();
        this.chain = this.chain.slice(0, forkPoint + 1);

        for (const block of forkBlocks) {
            this.applyConfirmedTransactions(block.data);
            this.chain.push(block);
        }

        for (const tx of discardedTxs) {
            if (!newTxIds.has(tx.id) && !this.mempool.some(t => t.id === tx.id)) {
                this.mempool.push(tx);
            }
        }

        this.mempool = this.mempool.filter(tx => !newTxIds.has(tx.id));
        this.persist();
    }

    minePendingTransactions(minerAddress: string): void {
        const workingUtxos = this.utxos.clone();
        const validTxs: Transaction[] = [];
        let collectedFees = 0;

        for (const tx of this.mempool) {
            if (!this.isValidTransaction(tx, workingUtxos)) {
                continue;
            }

            const fee = this.calculateTransactionFee(tx, workingUtxos);
            if (fee === null) {
                continue;
            }

            this.applyTransaction(tx, workingUtxos);
            validTxs.push(tx);
            collectedFees += fee;
        }

        const coinbaseTx = this.createCoinbaseTransaction(
            minerAddress,
            this.miningReward + collectedFees
        );

        this.applyTransaction(coinbaseTx, workingUtxos);
        validTxs.push(coinbaseTx);

        const difficulty = this.getCurrentDifficulty();
        const block = new Block(
            this.getLatestBlock().index + 1,
            validTxs,
            this.getLatestBlock().hash,
            Date.now(),
            difficulty
        );

        this.chain.push(block);
        this.applyConfirmedTransactions(validTxs);
    }

    async minePendingTransactionsAsync(minerAddress: string): Promise<void> {
        this.miningCancelled = false;

        const workingUtxos = this.utxos.clone();
        const validTxs: Transaction[] = [];
        let collectedFees = 0;

        for (const tx of this.mempool) {
            if (this.miningCancelled) return;

            if (!this.isValidTransaction(tx, workingUtxos)) {
                continue;
            }

            const fee = this.calculateTransactionFee(tx, workingUtxos);
            if (fee === null) {
                continue;
            }

            this.applyTransaction(tx, workingUtxos);
            validTxs.push(tx);
            collectedFees += fee;
        }

        if (this.miningCancelled) return;

        const coinbaseTx = this.createCoinbaseTransaction(
            minerAddress,
            this.miningReward + collectedFees
        );

        this.applyTransaction(coinbaseTx, workingUtxos);
        validTxs.push(coinbaseTx);

        const difficulty = this.getCurrentDifficulty();
        const block = new Block(
            this.getLatestBlock().index + 1,
            validTxs,
            this.getLatestBlock().hash,
            Date.now(),
            difficulty,
            true
        );

        if (this.miningCancelled) return;

        try {
            await block.mineBlockAsync();
        } catch (err) {
            if (this.miningCancelled) return;
            throw err;
        }

        if (this.miningCancelled) return;

        this.chain.push(block);
        this.applyConfirmedTransactions(validTxs);
    }

    cancelMining(): void {
        this.miningCancelled = true;
        Block.cancelMining();
    }

    addTransaction(tx: Transaction): boolean {
        if (!this.isValidTransaction(tx)) {
            return false;
        }

        this.mempool.push(tx);
        this.persist();
        return true;
    }

    isValidTransaction(tx: Transaction, availableUtxos: UTXOSet = this.getAvailableUtxos()): boolean {
        if (this.isCoinbaseTransaction(tx)) {
            return false;
        }

        return this.calculateTransactionFee(tx, availableUtxos) !== null;
    }

    isChainValid(): boolean {
        for (let i = 1; i < this.chain.length; i++) {
            const current = this.chain[i];
            const previous = this.chain[i - 1];

            if (current.hash !== current.calculateHash()) {
                return false;
            }

            if (current.previousHash !== previous.hash) {
                return false;
            }

            if (!current.hash.startsWith(current.difficulty)) {
                return false;
            }
        }

        return true;
    }

    getBalance(address: string): number {
        return this.utxos.getBalance(address);
    }

    getUtxos(): UTXO[] {
        return this.utxos.toArray();
    }

    getCurrency(): CurrencyConfig {
        return this.currency;
    }
}
