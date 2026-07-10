import * as readline from "readline";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import { Blockchain } from "./blockchain/Blockchain.js";
import { Transaction } from "./blockchain/Transaction.js";
import { WalletStore } from "./crypto/wallet-store.js";

const DATA_DIR = "./data";

function getBlockchain(): Blockchain {
  const chain = new Blockchain();
  chain.enablePersistence(DATA_DIR);
  return chain;
}

function getWalletStore(): WalletStore {
  return new WalletStore(DATA_DIR);
}

function askPassword(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function cmdGetInfo(): Promise<void> {
  const chain = getBlockchain();
  const currency = chain.getCurrency();
  console.log(`Valuta: ${currency.name} (${currency.symbol})`);
  console.log(`Altezza: ${chain.chain.length - 1} blocchi`);
  console.log(`Difficoltà: "${chain.getCurrentDifficulty()}"`);
  console.log(`Mempool: ${chain.mempool.length} transazioni pendenti`);
  console.log(`UTXO totali: ${chain.utxos.size()}`);
  console.log(`Reward mining: ${currency.miningReward} ${currency.symbol}`);
  console.log(`Chain valida: ${chain.isChainValid()}`);
  const tip = chain.getLatestBlock();
  console.log(`Ultimo blocco: ${tip.hash} (nonce: ${tip.nonce})`);
}

async function cmdBalance(address: string): Promise<void> {
  const chain = getBlockchain();
  const balance = chain.getBalance(address);
  console.log(`Saldo di ${address}: ${balance} MTC`);
  if (balance === 0) {
    console.log("Nessun UTXO trovato per questo indirizzo.");
  }
}

async function cmdSend(toAddress: string, amountStr: string): Promise<void> {
  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    console.error("Errore: importo non valido");
    process.exit(1);
  }

  const stores = getWalletStore();
  const wallets = stores.listWallets();
  if (wallets.length === 0) {
    console.error("Errore: nessun wallet. Creane uno con 'mattia-cli wallet create <name>'");
    process.exit(1);
  }

  const fromName = wallets[0].name;
  const password = await askPassword(`Password per wallet "${fromName}": `);
  const wallet = stores.loadWallet(fromName, password);
  if (!wallet) {
    console.error("Errore: password errata");
    process.exit(1);
  }

  const chain = getBlockchain();
  const utxos = chain.getUtxos().filter((u) => u.owner === wallet.getAddress());
  if (utxos.length === 0) {
    console.error("Errore: saldo insufficiente");
    process.exit(1);
  }

  let inputSum = 0;
  const inputs: { txId: string; index: number; signature: string; publicKey: string }[] = [];
  for (const utxo of utxos) {
    if (inputSum >= amount) break;
    inputs.push({ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey });
    inputSum += utxo.amount;
  }

  if (inputSum < amount) {
    console.error("Errore: saldo insufficiente");
    process.exit(1);
  }

  const outputs: { index: number; owner: string; amount: number }[] = [
    { index: 0, owner: toAddress, amount },
  ];

  const change = inputSum - amount - 1;
  if (change > 0) {
    outputs.push({ index: outputs.length, owner: wallet.getAddress(), amount: change });
  }

  const tx = new Transaction(inputs, outputs);
  for (let i = 0; i < inputs.length; i++) {
    tx.inputs[i].signature = wallet.sign(tx.getSigningData());
  }

  console.log(`\nTransazione creata (${tx.id.slice(0, 16)}...)`);
  console.log(`  Da: ${wallet.getAddress()}`);
  console.log(`  A: ${toAddress}`);
  console.log(`  Importo: ${amount} MTC`);
  console.log(`  Cambio: ${change > 0 ? change + " MTC" : "0 MTC"}`);
  console.log(`  Fee: 1 MTC`);

  const accepted = chain.addTransaction(tx);
  if (accepted) {
    console.log("\n✓ Transazione aggiunta al mempool");
  } else {
    console.error("\n✗ Transazione rifiutata");
  }
}

async function cmdMine(): Promise<void> {
  const chain = getBlockchain();
  const stores = getWalletStore();
  const wallets = stores.listWallets();

  let minerAddress: string;
  if (wallets.length > 0) {
    const password = await askPassword(`Password per wallet "${wallets[0].name}": `);
    const wallet = stores.loadWallet(wallets[0].name, password);
    if (!wallet) {
      console.error("Errore: password errata");
      process.exit(1);
    }
    minerAddress = wallet.getAddress();
  } else {
    const { Wallet } = await import("./crypto/Wallet.js");
    const temp = new Wallet();
    minerAddress = temp.getAddress();
    console.log("Attenzione: wallet temporaneo creato, le ricompense andranno perse!");
  }

  console.log(`\nMining con indirizzo: ${minerAddress}`);
  console.log(`Difficoltà: "${chain.getCurrentDifficulty()}"`);
  console.log(`Transazioni nel mempool: ${chain.mempool.length}`);

  try {
    await chain.minePendingTransactionsAsync(minerAddress);
    const tip = chain.getLatestBlock();
    console.log(`\n✓ Blocco minato!`);
    console.log(`  Indice: ${tip.index}`);
    console.log(`  Hash: ${tip.hash}`);
    console.log(`  Nonce: ${tip.nonce}`);
    console.log(`  Transazioni: ${tip.data.length}`);
  } catch (err: any) {
    if (err.message === "Mining cancelled") {
      console.log("\nMining annullato");
    } else {
      console.error("\nErrore mining:", err.message);
    }
  }
}

async function cmdWalletCreate(name: string): Promise<void> {
  const password = await askPassword("Password per il nuovo wallet: ");
  const stores = getWalletStore();
  try {
    const wallet = stores.createWallet(name, password);
    console.log(`\n✓ Wallet "${name}" creato!`);
    console.log(`  Indirizzo: ${wallet.getAddress()}`);
    console.log(`  Chiave pubblica: ${wallet.publicKey.slice(0, 40)}...`);
    console.log("\nIMPORTANTE: Conserva la password in un posto sicuro!");
  } catch (err: any) {
    console.error("Errore:", err.message);
  }
}

async function cmdWalletList(): Promise<void> {
  const stores = getWalletStore();
  const wallets = stores.listWallets();
  if (wallets.length === 0) {
    console.log("Nessun wallet trovato.");
    return;
  }
  console.log("Wallet disponibili:");
  for (const w of wallets) {
    console.log(`  - ${w.name}: ${w.address}`);
  }
}

async function cmdWalletExport(name: string): Promise<void> {
  const password = await askPassword(`Password per wallet "${name}": `);
  const stores = getWalletStore();
  const data = stores.exportWallet(name, password);
  if (!data) {
    console.error("Errore: password errata o wallet inesistente");
    process.exit(1);
  }
  const json = JSON.stringify(data, null, 2);
  const filename = `wallet-${name}.json`;
  await fs.writeFile(filename, json, "utf-8");
  console.log(`\n✓ Wallet esportato in ${filename}`);
}

async function cmdWalletImport(filePath: string): Promise<void> {
  if (!filePath) {
    console.error("Errore: specifica il file da importare");
    process.exit(1);
  }
  const raw = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(raw);
  if (!data.name || !data.publicKey || !data.privateKey) {
    console.error("Errore: file wallet non valido");
    process.exit(1);
  }
  const password = await askPassword("Password per cifrare il wallet importato: ");
  const stores = getWalletStore();
  try {
    const wallet = stores.importWallet(data, password);
    console.log(`\n✓ Wallet "${data.name}" importato!`);
    console.log(`  Indirizzo: ${wallet.getAddress()}`);
  } catch (err: any) {
    console.error("Errore:", err.message);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log("MattiaChain CLI");
    console.log("  getinfo                    - Info blockchain");
    console.log("  balance <address>          - Saldo di un indirizzo");
    console.log("  send <address> <amount>    - Invia transazione");
    console.log("  mine                       - Mina un blocco");
    console.log("  wallet create <name>       - Crea nuovo wallet");
    console.log("  wallet list                - Elenca wallet");
    console.log("  wallet export <name>       - Esporta wallet");
    console.log("  wallet import <file>       - Importa wallet");
    return;
  }

  switch (cmd) {
    case "getinfo":
      await cmdGetInfo();
      break;
    case "balance":
      if (!args[1]) { console.error("Errore: specifica un indirizzo"); process.exit(1); }
      await cmdBalance(args[1]);
      break;
    case "send":
      if (!args[1] || !args[2]) { console.error("Errore: usa: send <address> <amount>"); process.exit(1); }
      await cmdSend(args[1], args[2]);
      break;
    case "mine":
      await cmdMine();
      break;
    case "wallet":
      switch (args[1]) {
        case "create":
          if (!args[2]) { console.error("Errore: usa: wallet create <name>"); process.exit(1); }
          await cmdWalletCreate(args[2]);
          break;
        case "list":
          await cmdWalletList();
          break;
        case "export":
          if (!args[2]) { console.error("Errore: usa: wallet export <name>"); process.exit(1); }
          await cmdWalletExport(args[2]);
          break;
        case "import":
          if (!args[2]) { console.error("Errore: usa: wallet import <file>"); process.exit(1); }
          await cmdWalletImport(args[2]);
          break;
        default:
          console.error("Comando wallet sconosciuto. Usa: create, list, export, import");
      }
      break;
    default:
      console.error(`Comando sconosciuto: ${cmd}`);
      console.log("Usa 'mattia-cli --help' per la lista dei comandi");
      process.exit(1);
  }
}

main().catch(console.error);
