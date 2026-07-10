import express from "express";
import { Blockchain } from "./blockchain/Blockchain.js";
import { Transaction } from "./blockchain/Transaction.js";
import { WalletStore } from "./crypto/wallet-store.js";
import { Wallet } from "./crypto/Wallet.js";

const DATA_DIR = "./data";
const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();
app.use(express.json());

function getChain(): Blockchain {
  const chain = new Blockchain();
  chain.enablePersistence(DATA_DIR);
  return chain;
}

function getStore(): WalletStore {
  return new WalletStore(DATA_DIR);
}

app.get("/api/info", (_req, res) => {
  try {
    const chain = getChain();
    const currency = chain.getCurrency();
    const tip = chain.getLatestBlock();
    res.json({
      name: currency.name,
      symbol: currency.symbol,
      height: chain.chain.length - 1,
      difficulty: chain.getCurrentDifficulty(),
      mempoolSize: chain.mempool.length,
      utxoCount: chain.utxos.size(),
      miningReward: currency.miningReward,
      chainValid: chain.isChainValid(),
      lastBlock: {
        index: tip.index,
        hash: tip.hash,
        nonce: tip.nonce,
        timestamp: tip.timestamp,
        transactions: tip.data.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/balance/:address", (req, res) => {
  try {
    const chain = getChain();
    const balance = chain.getBalance(req.params.address);
    res.json({ address: req.params.address, balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/send", async (req, res) => {
  try {
    const { to, amount, from, password } = req.body;
    if (!to || amount == null) {
      res.status(400).json({ error: "Richiesti: to, amount" });
      return;
    }

    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: "Importo non valido" });
      return;
    }

    const store = getStore();
    let wallet: Wallet;

    if (from && password) {
      const w = store.loadWallet(from, password);
      if (!w) {
        res.status(401).json({ error: "Password errata o wallet inesistente" });
        return;
      }
      wallet = w;
    } else {
      const wallets = store.listWallets();
      if (wallets.length === 0) {
        res.status(400).json({ error: "Nessun wallet. Crea un wallet prima di inviare." });
        return;
      }
      res.status(401).json({ error: "Richiesto: password" });
      return;
    }

    const chain = getChain();
    const utxos = chain.getUtxos().filter((u) => u.owner === wallet.getAddress());
    if (utxos.length === 0) {
      res.status(400).json({ error: "Saldo insufficiente" });
      return;
    }

    let inputSum = 0;
    const inputs: { txId: string; index: number; signature: string; publicKey: string }[] = [];
    for (const utxo of utxos) {
      if (inputSum >= parsedAmount) break;
      inputs.push({ txId: utxo.txId, index: utxo.index, signature: "", publicKey: wallet.publicKey });
      inputSum += utxo.amount;
    }

    if (inputSum < parsedAmount) {
      res.status(400).json({ error: "Saldo insufficiente" });
      return;
    }

    const outputs: { index: number; owner: string; amount: number }[] = [
      { index: 0, owner: to, amount: parsedAmount },
    ];

    const change = inputSum - parsedAmount - 1;
    if (change > 0) {
      outputs.push({ index: outputs.length, owner: wallet.getAddress(), amount: change });
    }

    const tx = new Transaction(inputs, outputs);
    for (let i = 0; i < inputs.length; i++) {
      tx.inputs[i].signature = wallet.sign(tx.getSigningData());
    }

    const accepted = chain.addTransaction(tx);
    if (accepted) {
      res.json({
        success: true,
        txId: tx.id,
        from: wallet.getAddress(),
        to,
        amount: parsedAmount,
        fee: 1,
        change: change > 0 ? change : 0,
      });
    } else {
      res.status(400).json({ error: "Transazione rifiutata" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/mine", async (req, res) => {
  try {
    const { minerAddress } = req.body;
    let address: string;

    if (minerAddress) {
      address = minerAddress;
    } else {
      const wallets = new WalletStore(DATA_DIR).listWallets();
      if (wallets.length > 0) {
        address = wallets[0].address;
      } else {
        const temp = new Wallet();
        address = temp.getAddress();
      }
    }

    const chain = getChain();
    await chain.minePendingTransactionsAsync(address);
    const tip = chain.getLatestBlock();

    res.json({
      success: true,
      block: {
        index: tip.index,
        hash: tip.hash,
        nonce: tip.nonce,
        timestamp: tip.timestamp,
        transactions: tip.data.length,
      },
      miner: address,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/wallet/create", (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      res.status(400).json({ error: "Richiesti: name, password" });
      return;
    }

    const store = getStore();
    const wallet = store.createWallet(name, password);
    res.json({
      success: true,
      name,
      address: wallet.getAddress(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/wallet/list", (_req, res) => {
  try {
    const store = getStore();
    const wallets = store.listWallets();
    res.json({ wallets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/wallet/export", (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      res.status(400).json({ error: "Richiesti: name, password" });
      return;
    }

    const store = getStore();
    const data = store.exportWallet(name, password);
    if (!data) {
      res.status(401).json({ error: "Password errata o wallet inesistente" });
      return;
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/wallet/import", (req, res) => {
  try {
    const { data, password } = req.body;
    if (!data || !password) {
      res.status(400).json({ error: "Richiesti: data (oggetto wallet), password" });
      return;
    }

    if (!data.name || !data.publicKey || !data.privateKey) {
      res.status(400).json({ error: "Dati wallet non validi" });
      return;
    }

    const store = getStore();
    const wallet = store.importWallet(data, password);
    res.json({
      success: true,
      name: data.name,
      address: wallet.getAddress(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`MattiaChain REST API in ascolto su http://localhost:${PORT}`);
  console.log(`Endpoint disponibili:`);
  console.log(`  GET  /api/info`);
  console.log(`  GET  /api/balance/:address`);
  console.log(`  POST /api/send`);
  console.log(`  POST /api/mine`);
  console.log(`  POST /api/wallet/create`);
  console.log(`  GET  /api/wallet/list`);
  console.log(`  POST /api/wallet/export`);
  console.log(`  POST /api/wallet/import`);
});
