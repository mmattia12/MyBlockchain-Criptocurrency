import { describe, it, expect } from "vitest";
import { Transaction } from "../blockchain/Transaction.js";

describe("Transaction", () => {
    it("dovrebbe creare una transazione con input e output", () => {
        const tx = new Transaction(
            [
                { txId: "tx0", index: 0, signature: "sig1", publicKey: "pk1" }
            ],
            [
                { index: 0, owner: "bob", amount: 60 },
                { index: 1, owner: "alice", amount: 39 }
            ]
        );
        expect(tx.inputs).toHaveLength(1);
        expect(tx.outputs).toHaveLength(2);
        expect(tx.id).toBeTruthy();
        expect(typeof tx.id).toBe("string");
        expect(tx.id.length).toBe(64);
    });

    it("dovrebbe creare una coinbase (0 input, 1 output)", () => {
        const tx = new Transaction(
            [],
            [{ index: 0, owner: "miner", amount: 10 }]
        );
        expect(tx.inputs).toHaveLength(0);
        expect(tx.outputs).toHaveLength(1);
    });

    it("dovrebbe avere id deterministico per stessi dati", () => {
        const tx1 = new Transaction(
            [{ txId: "tx0", index: 0, signature: "sig1", publicKey: "pk1" }],
            [{ index: 0, owner: "bob", amount: 60 }]
        );
        const tx2 = new Transaction(
            [{ txId: "tx0", index: 0, signature: "sig1", publicKey: "pk1" }],
            [{ index: 0, owner: "bob", amount: 60 }]
        );
        expect(tx1.id).toBe(tx2.id);
    });

    it("dovrebbe avere id diverso per dati diversi", () => {
        const tx1 = new Transaction(
            [{ txId: "tx0", index: 0, signature: "sig1", publicKey: "pk1" }],
            [{ index: 0, owner: "bob", amount: 60 }]
        );
        const tx2 = new Transaction(
            [{ txId: "tx0", index: 0, signature: "sig2", publicKey: "pk2" }],
            [{ index: 0, owner: "alice", amount: 50 }]
        );
        expect(tx1.id).not.toBe(tx2.id);
    });

    it("dovrebbe escludere la firma dal calcolo dell'id", () => {
        const tx1 = new Transaction(
            [{ txId: "tx0", index: 0, signature: "sigA", publicKey: "pk1" }],
            [{ index: 0, owner: "bob", amount: 60 }]
        );
        const tx2 = new Transaction(
            [{ txId: "tx0", index: 0, signature: "sigB", publicKey: "pk1" }],
            [{ index: 0, owner: "bob", amount: 60 }]
        );
        expect(tx1.id).toBe(tx2.id);
    });

    it("getSigningData dovrebbe restituire lo stesso hash dell'id", () => {
        const tx = new Transaction(
            [{ txId: "tx0", index: 0, signature: "sig1", publicKey: "pk1" }],
            [{ index: 0, owner: "bob", amount: 60 }]
        );
        expect(tx.getSigningData()).toBe(tx.id);
    });
});
