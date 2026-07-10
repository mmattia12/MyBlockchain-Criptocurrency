import { Blockchain } from "./blockchain/Blockchain.js";
import { Transaction } from "./blockchain/Transaction.js";
import { Wallet } from "./crypto/Wallet.js";
import { formatCurrencyAmount } from "./blockchain/Currency.js";
import * as fs from "fs";

async function main() {
    console.log("=".repeat(70));
    console.log("MATTIACHAIN - DEMO COMPLETA");
    console.log("=".repeat(70));

    // Crea blockchain con persistenza
    const chain = new Blockchain();
    chain.enablePersistence("./data");
    const currency = chain.getCurrency();

    console.log(`\nValuta: ${currency.name} (${currency.symbol})`);
    console.log(`Reward mining: ${currency.miningReward} ${currency.symbol}`);
    console.log(`Difficoltà iniziale: "${currency.initialDifficulty}"`);
    console.log(`Adjustment interval: ogni ${currency.difficultyAdjustmentInterval} blocchi`);
    console.log(`Target block time: ${currency.targetBlockTimeSeconds}s`);
    console.log(`Blocchi in catena: ${chain.chain.length}`);

    if (chain.chain.length > 1) {
        console.log(`\n[PERSISTENZA] Caricata blockchain salvata con ${chain.chain.length} blocchi!`);
    }

    const alice = new Wallet();
    const bob = new Wallet();
    const charlie = new Wallet();

    console.log("\nIndirizzi generati:");
    console.log(`  Alice:  ${alice.getAddress()}`);
    console.log(`  Bob:    ${bob.getAddress()}`);
    console.log(`  Miner:  ${charlie.getAddress()}`);

    if (chain.chain.length === 1) {
        const genesisUtxo = chain.seedUtxo(alice.getAddress(), currency.demoGenesisAmount);
        const sendAmount = 60;
        const changeAmount = currency.demoGenesisAmount - sendAmount - 1;

        const tx1 = new Transaction(
            [
                {
                    txId: genesisUtxo.txId,
                    index: genesisUtxo.index,
                    signature: "",
                    publicKey: alice.publicKey
                }
            ],
            [
                {
                    index: 0,
                    owner: bob.getAddress(),
                    amount: sendAmount
                },
                {
                    index: 1,
                    owner: alice.getAddress(),
                    amount: changeAmount
                }
            ]
        );

        tx1.inputs[0].signature = alice.sign(tx1.getSigningData());

        const accepted = chain.addTransaction(tx1);
        console.log("\nTransazione accettata:", accepted);

        console.log("\nMining del blocco con difficoltà:", chain.getCurrentDifficulty());
        await chain.minePendingTransactionsAsync(charlie.getAddress());
        console.log("Blocco minato!");
    }

    console.log("\n" + "=".repeat(70));
    console.log("STATO FINALE");
    console.log("=".repeat(70));

    console.log(`\nBlocchi nella catena: ${chain.chain.length}`);
    chain.chain.forEach((block, i) => {
        console.log(`  Blocco ${i}: hash=${block.hash.slice(0, 12)}... nonce=${block.nonce} diff="${block.difficulty}" txs=${block.data.length}`);
    });

    console.log(`\nUTXO Set: ${chain.utxos.size()} UTXO`);
    console.dir(chain.getUtxos(), { depth: null });

    console.log(`\nSaldi:`);
    console.log(`  Alice:  ${formatCurrencyAmount(chain.getBalance(alice.getAddress()), currency)}`);
    console.log(`  Bob:    ${formatCurrencyAmount(chain.getBalance(bob.getAddress()), currency)}`);
    console.log(`  Miner:  ${formatCurrencyAmount(chain.getBalance(charlie.getAddress()), currency)}`);

    console.log(`\nChain valida: ${chain.isChainValid()}`);

    const dataPath = "./data/blockchain.json";
    if (fs.existsSync(dataPath)) {
        const stats = fs.statSync(dataPath);
        console.log(`\n[PERSISTENZA] Dati salvati su: ${dataPath} (${stats.size} bytes)`);
    }

    console.log("\n" + "=".repeat(70));
    console.log("DEMO COMPLETATA");
    console.log("=".repeat(70));
}

main().catch(console.error);
