import { describe, it, expect } from "vitest";
import { UTXOSet, UTXO } from "../blockchain/UTXOSet.js";

describe("UTXOSet", () => {
    it("dovrebbe creare un set vuoto", () => {
        const set = new UTXOSet();
        expect(set.size()).toBe(0);
    });

    it("dovrebbe aggiungere e trovare un UTXO", () => {
        const set = new UTXOSet();
        const utxo: UTXO = { txId: "tx1", index: 0, owner: "alice", amount: 100 };
        set.add(utxo);
        expect(set.size()).toBe(1);
        const found = set.find("tx1", 0);
        expect(found).not.toBeNull();
        expect(found!.amount).toBe(100);
        expect(found!.owner).toBe("alice");
    });

    it("dovrebbe rimuovere un UTXO", () => {
        const set = new UTXOSet();
        set.add({ txId: "tx1", index: 0, owner: "alice", amount: 100 });
        const removed = set.remove("tx1", 0);
        expect(removed).toBe(true);
        expect(set.size()).toBe(0);
        expect(set.find("tx1", 0)).toBeNull();
    });

    it("dovrebbe restituire false per rimozione di UTXO inesistente", () => {
        const set = new UTXOSet();
        const removed = set.remove("tx1", 0);
        expect(removed).toBe(false);
    });

    it("dovrebbe calcolare il saldo di un indirizzo", () => {
        const set = new UTXOSet();
        set.add({ txId: "tx1", index: 0, owner: "alice", amount: 100 });
        set.add({ txId: "tx1", index: 1, owner: "bob", amount: 50 });
        set.add({ txId: "tx2", index: 0, owner: "alice", amount: 25 });
        expect(set.getBalance("alice")).toBe(125);
        expect(set.getBalance("bob")).toBe(50);
        expect(set.getBalance("charlie")).toBe(0);
    });

    it("dovrebbe clonare correttamente il set", () => {
        const set = new UTXOSet();
        set.add({ txId: "tx1", index: 0, owner: "alice", amount: 100 });
        set.add({ txId: "tx2", index: 0, owner: "bob", amount: 50 });

        const cloned = set.clone();
        expect(cloned.size()).toBe(2);
        expect(cloned.getBalance("alice")).toBe(100);

        cloned.remove("tx1", 0);
        expect(cloned.size()).toBe(1);
        expect(set.size()).toBe(2);
    });

    it("dovrebbe filtrare UTXO disponibili", () => {
        const set = new UTXOSet();
        set.add({ txId: "tx1", index: 0, owner: "alice", amount: 100 });
        set.add({ txId: "tx2", index: 0, owner: "alice", amount: 50 });

        const spent = new Set<string>(["tx1:0"]);
        const available = set.getAvailable(spent);
        expect(available.size()).toBe(1);
        expect(available.getBalance("alice")).toBe(50);
        expect(available.find("tx1", 0)).toBeNull();
    });

    it("dovrebbe convertire in array", () => {
        const set = new UTXOSet();
        set.add({ txId: "tx1", index: 0, owner: "alice", amount: 100 });
        const arr = set.toArray();
        expect(arr).toHaveLength(1);
        expect(arr[0].txId).toBe("tx1");
    });

    it("dovrebbe applicare transazioni multiple", () => {
        const set = new UTXOSet();
        set.add({ txId: "tx1", index: 0, owner: "alice", amount: 100 });

        set.applyTransactions([
            {
                id: "tx2",
                inputs: [{ txId: "tx1", index: 0 }],
                outputs: [
                    { index: 0, owner: "bob", amount: 60 },
                    { index: 1, owner: "alice", amount: 40 }
                ]
            }
        ]);

        expect(set.size()).toBe(2);
        expect(set.getBalance("alice")).toBe(40);
        expect(set.getBalance("bob")).toBe(60);
        expect(set.find("tx1", 0)).toBeNull();
    });
});
