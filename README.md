# Flashmob

Copy trading on Definitive Flash, on the web and in Telegram. Traders publish calls as real orders, and followers copy them with the stop and target attached.

## Setup

```bash
pnpm install
cp .env.example .env
```

## Spike

`pnpm spike quote` prices a trade and spends nothing. `market`, `limit` and `bracket` need `SPIKE_PRIVATE_KEY` and `--execute`, and use real funds, so use a dedicated test wallet.

Flash docs are in `docs/flash/`.
