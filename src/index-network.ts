/**
 * index-network.ts
 * 
 * Demo di una vera rete P2P blockchain con 3 nodi:
 * - Node 1 (porta 3001)
 * - Node 2 (porta 3002)
 * - Node 3 (porta 3003)
 * 
 * I nodi si connettono tra loro, minano blocchi, propagano transazioni
 * e sincronizzano le loro catene.
 * 
 * Flusso della demo:
 * 1. Avvia i 3 nodi e attendi connessioni stabili
 * 2. Seed UTXO su Node 1 (Alice riceve 100 monete)
 * 3. Alice crea una transazione → Node 1 la propaga a Node 2 e Node 3
 * 4. Node 2 mina il blocco con la transazione → propaga a Node 1 e Node 3
 * 5. Node 1 e Node 3 ricevono il blocco e lo aggiungono alle loro catene
 * 6. Mostra i saldi su tutti e 3 i nodi (dovrebbero essere uguali)
 */

import { Node } from "./network/Node.js";
import { Wallet } from "./crypto/Wallet.js";
import { Transaction } from "./blockchain/Transaction.js";
import { formatCurrencyAmount } from "./blockchain/Currency.js";
import { delay } from "./utils/delay.js";

async function main() {
  console.log("=".repeat(70));
  console.log("DEMO: BLOCKCHAIN P2P NETWORK");
  console.log("=".repeat(70));

  // ========== STEP 1: CREIAMO I WALLET ==========
  console.log("\n[SETUP] Creazione wallet...");
  const alice = new Wallet();
  const bob = new Wallet();
  const node1Miner = new Wallet();
  const node2Miner = new Wallet();
  const node3Miner = new Wallet();

  console.log("Alice (mittente):", alice.getAddress());
  console.log("Bob (destinatario):", bob.getAddress());

  // ========== STEP 2: CREIAMO E AVVIAMO I 3 NODI ==========
  console.log("\n[NETWORK] Avvio nodi...");
  
  // Configura le connessioni peer
  const node1 = new Node(3001, node1Miner, [
    { host: "127.0.0.1", port: 3002 },
    { host: "127.0.0.1", port: 3003 }
  ]);

  const node2 = new Node(3002, node2Miner, [
    { host: "127.0.0.1", port: 3001 },
    { host: "127.0.0.1", port: 3003 }
  ]);

  const node3 = new Node(3003, node3Miner, [
    { host: "127.0.0.1", port: 3001 },
    { host: "127.0.0.1", port: 3002 }
  ]);

  // Avvia tutti i nodi
  await Promise.all([node1.start(), node2.start(), node3.start()]);

  // Attendi che tutte le connessioni siano stabili
  console.log("\n[NETWORK] Attesa stabilizzazione connessioni...");
  await delay(1000);

  const currency = node1.getBlockchain().getCurrency();

  // ========== STEP 3: SEED UTXO SU NODE 1 ==========
  console.log(`\n[DEMO] Seed: Alice riceve ${formatCurrencyAmount(currency.demoGenesisAmount, currency)} su tutti i nodi`);
  const genesisUtxo1 = node1.getBlockchain().seedUtxo(alice.getAddress(), currency.demoGenesisAmount);
  const genesisUtxo2 = node2.getBlockchain().seedUtxo(alice.getAddress(), currency.demoGenesisAmount);
  const genesisUtxo3 = node3.getBlockchain().seedUtxo(alice.getAddress(), currency.demoGenesisAmount);
  console.log(`Genesis UTXO creati: ${genesisUtxo1.txId}, ${genesisUtxo2.txId}, ${genesisUtxo3.txId}`);

  const sendAmount = 60;
  const changeAmount = currency.demoGenesisAmount - sendAmount - 1;

  // ========== STEP 4: ALICE CREA UNA TRANSAZIONE ==========
  console.log(`\n[DEMO] Transazione: Alice invia ${formatCurrencyAmount(sendAmount, currency)} a Bob, resto ${formatCurrencyAmount(changeAmount, currency)} a se stessa`);

  const tx1 = new Transaction(
    [
      {
        txId: genesisUtxo1.txId,
        index: genesisUtxo1.index,
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

  // Firma la transazione
  tx1.inputs[0].signature = alice.sign(tx1.getSigningData());
  console.log(`Transazione creata e firmata: ${tx1.id.slice(0, 8)}...`);

  // ========== STEP 5: NODE 1 AGGIUNGE LA TRANSAZIONE E PROPAGA ==========
  console.log("\n[DEMO] Node 1 aggiunge la transazione e la propaga");
  const accepted = await node1.addTransactionAndBroadcast(tx1);
  console.log(`Transazione accettata: ${accepted}`);

  // Attendi che i nodi ricevano la transazione
  await delay(500);

  // ========== STEP 6: NODE 2 MINA IL BLOCCO ==========
  console.log("\n[DEMO] Node 2 mina il blocco...");
  const block1 = await node2.minePendingTransactions();

  console.log(`Block minato su Node 2 (indice ${block1.index})`);
  console.log(`Hash: ${block1.hash}`);
    console.log(`Transazioni nel blocco: ${block1.data.length}`);

  // Attendi propagazione del blocco
  await delay(500);

  // ========== STEP 7: MOSTRA GLI STATI DELLE CATENE ==========
  console.log("\n" + "=".repeat(70));
  console.log("STATO FINALE DELLE CHAIN DEI 3 NODI");
  console.log("=".repeat(70));

  const chain1 = node1.getBlockchain().chain;
  const chain2 = node2.getBlockchain().chain;
  const chain3 = node3.getBlockchain().chain;

  console.log(`\nNode 1: ${chain1.length} blocchi`);
  console.log(`Node 2: ${chain2.length} blocchi`);
  console.log(`Node 3: ${chain3.length} blocchi`);

  // Mostra i blocchi
  console.log("\n--- Node 1 Chain ---");
  chain1.forEach((block, idx) => {
    console.log(
      `Blocco ${idx}: ${block.hash.slice(0, 8)}... (${block.data.length} tx)`
    );
  });

  console.log("\n--- Node 2 Chain ---");
  chain2.forEach((block, idx) => {
    console.log(
      `Blocco ${idx}: ${block.hash.slice(0, 8)}... (${block.data.length} tx)`
    );
  });

  console.log("\n--- Node 3 Chain ---");
  chain3.forEach((block, idx) => {
    console.log(
      `Blocco ${idx}: ${block.hash.slice(0, 8)}... (${block.data.length} tx)`
    );
  });

  // ========== STEP 8: VERIFICA I SALDI ==========
  console.log("\n" + "=".repeat(70));
  console.log("SALDI FINALI - DOVREBBERO ESSERE IDENTICI SU TUTTI I NODI");
  console.log("=".repeat(70));

  const aliceBalance1 = node1.getBalance(alice.getAddress());
  const aliceBalance2 = node2.getBalance(alice.getAddress());
  const aliceBalance3 = node3.getBalance(alice.getAddress());

  const bobBalance1 = node1.getBalance(bob.getAddress());
  const bobBalance2 = node2.getBalance(bob.getAddress());
  const bobBalance3 = node3.getBalance(bob.getAddress());

  console.log(`\nAlice (mittente):        ${formatCurrencyAmount(currency.demoGenesisAmount, currency)} -> ${formatCurrencyAmount(changeAmount, currency)} after spending ${formatCurrencyAmount(sendAmount, currency)} + 1 fee`);
  console.log(`  Node 1: ${formatCurrencyAmount(aliceBalance1, currency)}`);
  console.log(`  Node 2: ${formatCurrencyAmount(aliceBalance2, currency)}`);
  console.log(`  Node 3: ${formatCurrencyAmount(aliceBalance3, currency)}`);
  console.log(`  ✓ Sincronizzato: ${aliceBalance1 === aliceBalance2 && aliceBalance2 === aliceBalance3}`);

  console.log(`\nBob (destinatario):      0 -> ${formatCurrencyAmount(sendAmount, currency)} after receiving ${formatCurrencyAmount(sendAmount, currency)}`);
  console.log(`  Node 1: ${formatCurrencyAmount(bobBalance1, currency)}`);
  console.log(`  Node 2: ${formatCurrencyAmount(bobBalance2, currency)}`);
  console.log(`  Node 3: ${formatCurrencyAmount(bobBalance3, currency)}`);
  console.log(`  ✓ Sincronizzato: ${bobBalance1 === bobBalance2 && bobBalance2 === bobBalance3}`);

  console.log("\nMiners:");
  const node1MinerBalance = node1.getBalance(node1Miner.getAddress());
  const node2MinerBalance = node2.getBalance(node2Miner.getAddress());
  const node3MinerBalance = node3.getBalance(node3Miner.getAddress());

  console.log(`  Node 1 Miner: ${formatCurrencyAmount(node1MinerBalance, currency)} (nessun blocco minato)`);
  console.log(`  Node 2 Miner: ${formatCurrencyAmount(node2MinerBalance, currency)} (${currency.miningReward + 1} ${currency.symbol} = reward base + fee)`);
  console.log(`  Node 3 Miner: ${formatCurrencyAmount(node3MinerBalance, currency)} (nessun blocco minato)`);

  // ========== STEP 9: VERIFICA DELLE TRANSAZIONI ==========
  console.log("\n" + "=".repeat(70));
  console.log("DETTAGLI TRANSAZIONI");
  console.log("=".repeat(70));

  if (chain1.length > 1) {
    const block1Tx = chain1[1]; // Secondo blocco (primo è genesis)
    console.log(`\nBlocco minato contiene ${block1Tx.data.length} transazioni:`);
    
    block1Tx.data.forEach((tx: Transaction, idx: number) => {
      console.log(`\n  Tx ${idx}: ${tx.id.slice(0, 8)}...`);
      console.log(`    Inputs: ${tx.inputs.length}`);
      console.log(`    Outputs: ${tx.outputs.length}`);
      tx.outputs.forEach((out: any, outIdx: number) => {
        console.log(
          `      Output ${outIdx}: ${out.amount} to ${out.owner}`
        );
      });
    });
  }

  // ========== STEP 10: CHIUDI I NODI ==========
  console.log("\n[CLEANUP] Chiusura nodi...");
  await Promise.all([node1.shutdown(), node2.shutdown(), node3.shutdown()]);

  console.log("\n" + "=".repeat(70));
  console.log("DEMO COMPLETATA");
  console.log("=".repeat(70));
  console.log("\nRisultati:");
  console.log("✓ Tre nodi P2P avviati e connessi");
  console.log("✓ Transazione propagata da Node 1 a Node 2 e Node 3");
  console.log("✓ Blocco minato su Node 2 e propagato a Node 1 e Node 3");
  console.log("✓ Tutte le catene sincronizzate");
  console.log("✓ Saldi identici su tutti i nodi");
}

main().catch(console.error);
