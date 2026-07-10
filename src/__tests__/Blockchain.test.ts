import { describe, it, expect, beforeAll } from "vitest";
import { Block } from "../blockchain/block.js";
import { Blockchain } from "../blockchain/Blockchain.js";
import { Transaction } from "../blockchain/Transaction.js";
import { Wallet } from "../crypto/Wallet.js";
import { DEFAULT_CURRENCY, CurrencyConfig } from "../blockchain/Currency.js";

describe("Blockchain", () => {
    let chain: Blockchain;
    let alice: Wallet;
    let bob: Wallet;
    let miner: Wallet;

    beforeAll(() => {
        chain = new Blockchain();
        alice = new Wallet();
        bob = new Wallet();
        miner = new Wallet();
    });

    it("dovrebbe creare una blockchain con il blocco genesis", () => {
        expect(chain.chain).toHaveLength(1);
        expect(chain.chain[0].index).toBe(0);
        expect(chain.chain[0].previousHash).toBe("0");
        expect(chain.chain[0].data).toHaveLength(0);
    });

    it("dovrebbe restituire l'ultimo blocco", () => {
        const latest = chain.getLatestBlock();
        expect(latest.index).toBe(0);
    });

    it("dovrebbe validare una catena vuota (solo genesis)", () => {
        expect(chain.isChainValid()).toBe(true);
    });

    it("dovrebbe seedare un UTXO genesis", () => {
        const utxo = chain.seedUtxo(alice.getAddress(), 100);
        expect(utxo.txId).toContain("genesis");
        expect(utxo.amount).toBe(100);
        expect(utxo.owner).toBe(alice.getAddress());
        expect(chain.getBalance(alice.getAddress())).toBe(100);
    });

    it("dovrebbe rifiutare una transazione coinbase da utente", () => {
        const coinbase = new Transaction([], [{ index: 0, owner: alice.getAddress(), amount: 10 }]);
        expect(chain.addTransaction(coinbase)).toBe(false);
    });

    it("dovrebbe rifiutare una transazione senza firma", () => {
        const tx = new Transaction(
            [{ txId: "nonexistent", index: 0, signature: "", publicKey: alice.publicKey }],
            [{ index: 0, owner: bob.getAddress(), amount: 10 }]
        );
        expect(chain.addTransaction(tx)).toBe(false);
    });

    it("dovrebbe accettare una transazione valida", () => {
        const genesisUtxo = chain.seedUtxo(alice.getAddress(), 50);
        const tx = new Transaction(
            [{ txId: genesisUtxo.txId, index: genesisUtxo.index, signature: "", publicKey: alice.publicKey }],
            [
                { index: 0, owner: bob.getAddress(), amount: 30 },
                { index: 1, owner: alice.getAddress(), amount: 19 }
            ]
        );
        tx.inputs[0].signature = alice.sign(tx.getSigningData());
        const accepted = chain.addTransaction(tx);
        expect(accepted).toBe(true);
        expect(chain.mempool).toHaveLength(1);
    });

    it("dovrebbe minare le transazioni in sospeso", () => {
        chain.minePendingTransactions(miner.getAddress());
        expect(chain.chain).toHaveLength(2);
        expect(chain.mempool).toHaveLength(0);
        expect(chain.getBalance(miner.getAddress())).toBeGreaterThanOrEqual(10);
    });

    it("la catena dovrebbe essere valida dopo il mining", () => {
        expect(chain.isChainValid()).toBe(true);
    });

    it("dovrebbe avere difficulty corretta su ogni blocco", () => {
        for (const block of chain.chain) {
            expect(block.hash.startsWith(block.difficulty)).toBe(true);
        }
    });

    it("dovrebbe calcolare correttamente i saldi dopo transazioni multiple", () => {
        const bobBalance = chain.getBalance(bob.getAddress());
        expect(bobBalance).toBe(30);
    });

    it("dovrebbe avere difficoltà iniziale predefinita", () => {
        expect(chain.getCurrentDifficulty()).toBe(DEFAULT_CURRENCY.initialDifficulty);
    });
});

describe("Blockchain - Validazione catena", () => {
    it("dovrebbe rilevare un blocco manomesso", () => {
        const chain = new Blockchain();
        const wallet = new Wallet();
        const miner = new Wallet();
        chain.seedUtxo(wallet.getAddress(), 100);

        const utxo = chain.seedUtxo(wallet.getAddress(), 50);
        const tx = new Transaction(
            [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey }],
            [{ index: 0, owner: miner.getAddress(), amount: 50 }]
        );
        tx.inputs[0].signature = wallet.sign(tx.getSigningData());
        chain.addTransaction(tx);
        chain.minePendingTransactions(miner.getAddress());

        expect(chain.isChainValid()).toBe(true);

        chain.chain[1].data = [];
        expect(chain.isChainValid()).toBe(false);
    });
});

describe("Blockchain - Difficulty adjustment", () => {
    it("dovrebbe aumentare la difficoltà se i blocchi sono molto veloci", () => {
        const currency: CurrencyConfig = {
            ...DEFAULT_CURRENCY,
            initialDifficulty: "0",
            targetBlockTimeSeconds: 3600,
            difficultyAdjustmentInterval: 2
        };
        const chain = new Blockchain(currency);
        const wallet = new Wallet();
        const miner = new Wallet();

        for (let i = 0; i < 6; i++) {
            const utxo = chain.seedUtxo(wallet.getAddress(), 100);
            const tx = new Transaction(
                [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey }],
                [{ index: 0, owner: miner.getAddress(), amount: 50 }]
            );
            tx.inputs[0].signature = wallet.sign(tx.getSigningData());
            chain.addTransaction(tx);
            chain.minePendingTransactions(miner.getAddress());
        }

        expect(chain.chain[1].difficulty).toBe("0");
        expect(chain.chain[2].difficulty).toBe("00");
        expect(chain.chain[3].difficulty).toBe("00");
        expect(chain.chain[4].difficulty).toBe("000");
        expect(chain.chain[5].difficulty).toBe("000");
        expect(chain.chain[6].difficulty).toBe("0000");
    });

    it("dovrebbe diminuire la difficoltà se i blocchi sono lenti", () => {
        const currency: CurrencyConfig = {
            ...DEFAULT_CURRENCY,
            initialDifficulty: "000",
            targetBlockTimeSeconds: 0,
            difficultyAdjustmentInterval: 2
        };
        const chain = new Blockchain(currency);
        const wallet = new Wallet();
        const miner = new Wallet();

        for (let i = 0; i < 6; i++) {
            const utxo = chain.seedUtxo(wallet.getAddress(), 100);
            const tx = new Transaction(
                [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey }],
                [{ index: 0, owner: miner.getAddress(), amount: 50 }]
            );
            tx.inputs[0].signature = wallet.sign(tx.getSigningData());
            chain.addTransaction(tx);
            chain.minePendingTransactions(miner.getAddress());
        }

        expect(chain.chain[1].difficulty).toBe("000");
        expect(chain.chain[2].difficulty).toBe("000");
        const block4diff = chain.chain[4].difficulty;
        expect(block4diff.length).toBeLessThan("000".length);
    });

    it("ogni blocco dovrebbe avere hash valido per la propria difficoltà", () => {
        const currency: CurrencyConfig = {
            ...DEFAULT_CURRENCY,
            initialDifficulty: "0",
            targetBlockTimeSeconds: 3600,
            difficultyAdjustmentInterval: 2
        };
        const chain = new Blockchain(currency);
        const wallet = new Wallet();
        const miner = new Wallet();

        for (let i = 0; i < 6; i++) {
            const utxo = chain.seedUtxo(wallet.getAddress(), 100);
            const tx = new Transaction(
                [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey }],
                [{ index: 0, owner: miner.getAddress(), amount: 50 }]
            );
            tx.inputs[0].signature = wallet.sign(tx.getSigningData());
            chain.addTransaction(tx);
            chain.minePendingTransactions(miner.getAddress());
        }

        for (const block of chain.chain) {
            expect(block.hash.startsWith(block.difficulty)).toBe(true);
        }
    });
});

describe("Blockchain - Fase 2: verifyBlockPow", () => {
    it("dovrebbe accettare un blocco con PoW valido", () => {
        const chain = new Blockchain();
        const miner = new Wallet();
        const utxo = chain.seedUtxo(miner.getAddress(), 100);
        const tx = new Transaction(
            [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: miner.publicKey }],
            [{ index: 0, owner: miner.getAddress(), amount: 100 }]
        );
        tx.inputs[0].signature = miner.sign(tx.getSigningData());
        chain.addTransaction(tx);
        chain.minePendingTransactions(miner.getAddress());
        const block = chain.chain[1];
        expect(chain.verifyBlockPow(block)).toBe(true);
    });

    it("dovrebbe rifiutare un blocco con PoW non valido", () => {
        const chain = new Blockchain();
        const invalidBlock = chain.chain[0];
        invalidBlock.difficulty = "0";
        invalidBlock.hash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        expect(chain.verifyBlockPow(invalidBlock)).toBe(false);
    });
});

describe("Blockchain - Fase 2: validateBlockTransactions", () => {
    it("dovrebbe accettare un blocco con transazioni valide", () => {
        const chain = new Blockchain();
        const wallet = new Wallet();
        const miner = new Wallet();

        chain.seedUtxo(wallet.getAddress(), 100);
        const utxo = chain.seedUtxo(wallet.getAddress(), 50);
        const tx = new Transaction(
            [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey }],
            [{ index: 0, owner: miner.getAddress(), amount: 50 }]
        );
        tx.inputs[0].signature = wallet.sign(tx.getSigningData());

        const coinbase = new Transaction([], [{ index: 0, owner: miner.getAddress(), amount: 10 }]);

        chain.addTransaction(tx);
        const block = new Block(1, [tx, coinbase], chain.chain[0].hash, Date.now(), "0000", true);
        block.hash = block.calculateHash();
        block.nonce = 0;

        expect(chain.validateBlockTransactions(block)).toBe(true);
    });

    it("dovrebbe rifiutare un blocco con firma mancante", () => {
        const chain = new Blockchain();
        const wallet = new Wallet();
        const miner = new Wallet();

        chain.seedUtxo(wallet.getAddress(), 50);
        const tx = new Transaction(
            [{ txId: "genesis-0", index: 0, signature: "", publicKey: wallet.publicKey }],
            [{ index: 0, owner: miner.publicKey, amount: 50 }]
        );

        const coinbase = new Transaction([], [{ index: 0, owner: miner.publicKey, amount: 10 }]);
        const block = new Block(1, [tx, coinbase], chain.chain[0].hash, Date.now(), "0000", true);
        block.hash = block.calculateHash();
        block.nonce = 0;

        expect(chain.validateBlockTransactions(block)).toBe(false);
    });

    it("dovrebbe rifiutare un blocco con coinbase in mezzo", () => {
        const chain = new Blockchain();
        const coinbaseWrong = new Transaction([], [{ index: 0, owner: "miner", amount: 10 }]);
        const block = new Block(1, [coinbaseWrong, coinbaseWrong], chain.chain[0].hash, Date.now(), "0000", true);
        block.hash = block.calculateHash();
        block.nonce = 0;
        expect(chain.validateBlockTransactions(block)).toBe(false);
    });
});

describe("Blockchain - Fase 2: registerBlock e fork handling", () => {
    it("dovrebbe accettare un blocco sequenziale via registerBlock", () => {
        const chain = new Blockchain();
        const wallet = new Wallet();
        const miner = new Wallet();

        chain.seedUtxo(wallet.getAddress(), 100);
        const utxo = chain.seedUtxo(wallet.getAddress(), 50);
        const tx = new Transaction(
            [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey }],
            [{ index: 0, owner: miner.getAddress(), amount: 50 }]
        );
        tx.inputs[0].signature = wallet.sign(tx.getSigningData());
        chain.addTransaction(tx);

        const difficulty = chain.getCurrentDifficulty();
        const block = new Block(1, [], chain.chain[0].hash, Date.now(), difficulty, true);
        block.hash = block.mineBlock();

        const accepted = chain.registerBlock(block);
        expect(accepted).toBe(true);
        expect(chain.chain).toHaveLength(2);
    });

    it("dovrebbe gestire fork e fare reorg quando la fork chain è più lunga", () => {
        const chain = new Blockchain();
        const wallet = new Wallet();
        const miner = new Wallet();

        chain.seedUtxo(wallet.getAddress(), 200);
        const utxo1 = chain.seedUtxo(wallet.getAddress(), 50);
        const tx1 = new Transaction(
            [{ txId: utxo1.txId, index: utxo1.index, signature: "", publicKey: wallet.publicKey }],
            [{ index: 0, owner: miner.getAddress(), amount: 50 }]
        );
        tx1.inputs[0].signature = wallet.sign(tx1.getSigningData());
        chain.addTransaction(tx1);
        chain.minePendingTransactions(miner.getAddress());

        const chainLenBeforeFork = chain.chain.length;

        const forkBlock1 = new Block(
            chainLenBeforeFork,
            [],
            chain.chain[chainLenBeforeFork - 1].hash,
            Date.now(),
            chain.getCurrentDifficulty()
        );

        const forkBlock2 = new Block(
            chainLenBeforeFork + 1,
            [],
            forkBlock1.hash,
            Date.now(),
            chain.getCurrentDifficulty()
        );

        const accepted1 = chain.registerBlock(forkBlock1);
        expect(accepted1).toBe(true);

        const accepted2 = chain.registerBlock(forkBlock2);
        expect(accepted2).toBe(true);

        expect(chain.chain.length).toBe(chainLenBeforeFork + 2);
    });

    it("dovrebbe avere UTXO snapshot dopo reorg", () => {
        const chain = new Blockchain();
        const wallet = new Wallet();
        const miner = new Wallet();
        chain.seedUtxo(wallet.getAddress(), 100);

        const utxo = chain.seedUtxo(wallet.getAddress(), 50);
        const tx = new Transaction(
            [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey }],
            [{ index: 0, owner: miner.getAddress(), amount: 50 }]
        );
        tx.inputs[0].signature = wallet.sign(tx.getSigningData());
        chain.addTransaction(tx);
        chain.minePendingTransactions(miner.getAddress());

        const utxoSnapshotCount = (chain as any).utxoSnapshots.length;
        expect(utxoSnapshotCount).toBe(chain.chain.length + 1);
    });
});

describe("Blockchain - Fase 2: Mining asincrono", () => {
    it("dovrebbe minare un blocco con minePendingTransactionsAsync", async () => {
        const chain = new Blockchain();
        const wallet = new Wallet();
        const miner = new Wallet();

        chain.seedUtxo(wallet.getAddress(), 100);
        const utxo = chain.seedUtxo(wallet.getAddress(), 50);
        const tx = new Transaction(
            [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey }],
            [{ index: 0, owner: miner.getAddress(), amount: 50 }]
        );
        tx.inputs[0].signature = wallet.sign(tx.getSigningData());
        chain.addTransaction(tx);

        await chain.minePendingTransactionsAsync(miner.getAddress());
        expect(chain.chain).toHaveLength(2);
        expect(chain.mempool).toHaveLength(0);
        expect(chain.getBalance(miner.getAddress())).toBeGreaterThanOrEqual(10);
    });

    it("dovrebbe cancellare il mining asincrono", async () => {
        const chain = new Blockchain();
        const wallet = new Wallet();
        const miner = new Wallet();

        chain.seedUtxo(wallet.getAddress(), 100);
        const utxo = chain.seedUtxo(wallet.getAddress(), 50);
        const tx = new Transaction(
            [{ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey }],
            [{ index: 0, owner: miner.getAddress(), amount: 50 }]
        );
        tx.inputs[0].signature = wallet.sign(tx.getSigningData());
        chain.addTransaction(tx);

        const minePromise = chain.minePendingTransactionsAsync(miner.getAddress());
        chain.cancelMining();

        await expect(minePromise).resolves.toBeUndefined();
        expect(chain.chain).toHaveLength(1);
    });
});
