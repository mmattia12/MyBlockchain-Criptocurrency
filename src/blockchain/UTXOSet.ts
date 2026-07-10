/**
 * UTXOSet - Gestisce il set di UTXO (Unspent Transaction Outputs)
 * 
 * Gli UTXO sono gli output non ancora spesi di una transazione.
 * Ogni UTXO è identificato da una coppia (txId, index) e contiene
 * l'indirizzo proprietario e l'importo.
 * 
 * Questa classe incapsula la Map degli UTXO e tutte le operazioni
 * necessarie per gestirli: lookup, aggiunta, rimozione, validazione.
 * 
 * Usando una Map anziché un array, le operazioni di ricerca e cancellazione
 * sono O(1) invece di O(n).
 */

export type UTXO = {
    txId: string;       // ID della transazione che ha generato questo output
    index: number;      // Indice dell'output all'interno della transazione
    owner: string;      // Indirizzo pubblico del proprietario
    amount: number;     // Importo dell'output
};

export class UTXOSet {
    /**
     * Map che memorizza gli UTXO.
     * Chiave: `txId:index` (formato standardizzato per lookup veloce)
     * Valore: l'UTXO stesso
     */
    private utxos: Map<string, UTXO>;

    constructor() {
        this.utxos = new Map();
    }

    /**
     * Converte txId e index in una chiave standardizzata per la Map.
     * Ad esempio: `txId:0` per il primo output della transazione txId.
     */
    private getKey(txId: string, index: number): string {
        return `${txId}:${index}`;
    }

    /**
     * Aggiunge un nuovo UTXO al set.
     * Se un UTXO con la stessa chiave esiste già, viene sovrascritto.
     */
    add(utxo: UTXO): void {
        this.utxos.set(this.getKey(utxo.txId, utxo.index), utxo);
    }

    /**
     * Rimuove un UTXO dal set.
     * Restituisce true se l'UTXO è stato trovato e rimosso, false altrimenti.
     */
    remove(txId: string, index: number): boolean {
        return this.utxos.delete(this.getKey(txId, index));
    }

    /**
     * Cerca un UTXO specifico per txId e index.
     * Restituisce l'UTXO se trovato, null altrimenti.
     */
    find(txId: string, index: number): UTXO | null {
        return this.utxos.get(this.getKey(txId, index)) ?? null;
    }

    /**
     * Crea un'istanza separata dei soli UTXO disponibili.
     * 
     * Un UTXO è disponibile se non è stato speso ancora.
     * Per sapere se è stato speso, controlliamo se è in una transazione
     * non ancora confermata che lo utilizza come input.
     * 
     * Questo metodo è utile durante la validazione e il mining,
     * quando vogliamo usare una "snapshot" coerente degli UTXO senza
     * alterare lo stato globale.
     */
    getAvailable(spentInputs: Set<string>): UTXOSet {
        const available = new UTXOSet();

        for (const [key, utxo] of this.utxos.entries()) {
            if (!spentInputs.has(key)) {
                available.add(utxo);
            }
        }

        return available;
    }

    /**
     * Applica le transazioni al set di UTXO.
     * 
     * Per ogni transazione:
     * 1. Rimuove gli input (UTXO spesi)
     * 2. Aggiunge gli output (nuovi UTXO creati)
     * 
     * Questo metodo modifica lo stato interno del set.
     */
    applyTransactions(transactions: Array<{ id: string; inputs: Array<{ txId: string; index: number }>; outputs: Array<{ index: number; owner: string; amount: number }> }>): void {
        for (const tx of transactions) {
            // Rimuove gli UTXO spesi da questa transazione
            for (const input of tx.inputs) {
                this.remove(input.txId, input.index);
            }

            // Aggiunge i nuovi UTXO creati da questa transazione
            for (const output of tx.outputs) {
                this.add({
                    txId: tx.id,
                    index: output.index,
                    owner: output.owner,
                    amount: output.amount
                });
            }
        }
    }

    /**
     * Crea una copia profonda del set.
     * Utile per creare snapshot durante il mining senza alterare lo stato globale.
     */
    clone(): UTXOSet {
        const cloned = new UTXOSet();
        for (const utxo of this.utxos.values()) {
            cloned.add({ ...utxo });
        }
        return cloned;
    }

    /**
     * Restituisce tutti gli UTXO come array.
     * Usato principalmente per il debug e la visualizzazione.
     */
    toArray(): UTXO[] {
        return [...this.utxos.values()];
    }

    /**
     * Calcola il saldo totale di un indirizzo sommando
     * tutti gli UTXO che gli appartengono.
     */
    getBalance(address: string): number {
        let balance = 0;
        for (const utxo of this.utxos.values()) {
            if (utxo.owner === address) {
                balance += utxo.amount;
            }
        }
        return balance;
    }

    /**
     * Restituisce il numero di UTXO nel set.
     */
    size(): number {
        return this.utxos.size;
    }
}
