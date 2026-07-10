# MattiaChain

Blockchain didattica in TypeScript con la valuta **MattiaCoin (MTC)**.

## Caratteristiche

- Blockchain con Proof of Work (difficoltà regolabile)
- Transazioni con UTXO set (modello Bitcoin-like)
- Wallet RSA 2048-bit con indirizzi Base58
- Mining sincrono e asincrono (con Worker Thread)
- Difficulty adjustment
- Gestione fork e reorg
- Mempool per transazioni in attesa
- Rete P2P TCP
- Persistenza su disco (JSON crittografato per wallet)
- CLI interattiva
- REST API HTTP (Express)
- Test di unità e integrazione (Vitest)

## Requisiti

- Node.js 20+

## Installazione

```bash
npm install
```

## Utilizzo

```bash
# Demo singolo nodo
npm run dev

# Demo rete P2P (3 nodi)
npm run network

# CLI interattiva
npm run cli

# REST API server
npm run server

# Build
npm run build

# Avvio versione compilata
npm start
```

### Comandi CLI

- `getinfo` — Info blockchain
- `balance <address>` — Saldo di un indirizzo
- `send <from> <to> <amount>` — Invia transazione
- `mine <address>` — Mina un blocco
- `wallet create <name>` — Crea wallet
- `wallet list` — Elenca wallet
- `wallet export <name>` — Esporta wallet
- `wallet import <json>` — Importa wallet

## API REST

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/api/info` | Info blockchain |
| GET | `/api/balance/:address` | Saldo indirizzo |
| POST | `/api/send` | Invia transazione |
| POST | `/api/mine` | Mina blocco |
| POST | `/api/wallet/create` | Crea wallet |
| GET | `/api/wallet/list` | Elenca wallet |
| POST | `/api/wallet/export` | Esporta wallet |
| POST | `/api/wallet/import` | Importa wallet |

## Test

```bash
npm test
```
