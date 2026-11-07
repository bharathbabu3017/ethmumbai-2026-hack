# Flashmob

Copy trading on [Definitive Flash](https://definitive.fi), on the web and in Telegram.

Traders place real orders, and every one of them is public and copyable. Followers get a Telegram alert and copy in one tap, or turn on auto-copy with their own limits. Anyone can also describe a strategy in plain words and run it as an AI agent with its own wallet, limits and public record.

Trading runs on Base.

## What it does

**Copy traders**
- Discover ranks traders and agents by real fills, not self-reported results.
- Copy a single trade, or start auto-copy with your own size, daily cap, blocked tokens and exits.
- When a trader sells, moves or cancels an order, copies can follow automatically.

**Trade**
- All nine Flash order types: market, limit, stop buy, stop loss, take profit, bracket, TWAP, trailing stop and trailing stop limit.
- Stops and targets can be attached to a buy.
- The same orders work from the Telegram bot, with a Confirm step on each one.

**Build agents**
- Write a strategy in plain words, and a model turns it into a plan that code can check.
- If it can't do exactly what you wrote, it builds the closest plan and lists every difference.
- Try the plan on live data before creating the agent. Nothing is placed by a preview.
- Each agent has its own wallet. Fund it, and it starts by itself.
- Pause, edit, or withdraw part of its funds while it runs. Stop it to sell up and send everything back.
- Agents are public by default. A private agent stays off Discover and hides its strategy and reasons, but its trades stay on its profile.

**Telegram**
- Alerts for traders you follow, your own fills, and auto-copy problems.
- Agent owners hear when an agent goes live, trades, can't buy, or has an order fail.
- `/agents` shows each agent's status, balance and last check, with Pause and Resume.

## How it works

```
 Browser (Next.js)                Telegram
        |                            |
        |  signs in your wallet      |  commands and alerts
        v                            v
 +--------------+   wallet_jobs   +----------------------------+
 |   apps/web   | --------------> |        apps/worker         |
 |   API routes |    Postgres     |  bot, order listener,      |
 +--------------+                 |  auto-copy, agents, jobs   |
        |                         +----------------------------+
        |                              |              |
        v                              v              v
  Definitive Flash  <------------------+        Privy server signer
  quotes, orders, order stream
```

- **The website** signs orders in your browser with your own wallet.
- **The worker** does everything that happens while you're away. It watches the Flash order stream, sends alerts, places copies, runs agents, and works through `wallet_jobs`.
- **Signing while offline** uses a Privy embedded wallet. You approve a Privy server signer once, and only then can the bot and auto-copy sign for you.
- **Agent wallets** are created per agent and owned by that server signer.

### How an agent decides

1. Every check reads the market and tests the plan's rules in code. A number it can't read fails its rule, so missing data never causes a buy.
2. If the plan has a condition numbers can't test, such as "no bad news", the model is asked at that moment. Anything unclear counts as no.
3. Budget, max per trade and token limits are enforced in code, whatever the strategy or the model says.
4. Every check is logged publicly, including when it does nothing.
5. Exits are placed within about a minute of a fill.

## Project layout

| Path | What's there |
| - | - |
| `apps/web` | Next.js site and API routes |
| `apps/worker` | Telegram bot, order listener, auto-copy, agent runner and job queue |
| `packages/db` | Drizzle schema, migrations and queries |
| `packages/flash` | Flash client, order building, copy rules, agent plans and indicators |
| `packages/signer` | Privy signing for the worker |
| `docs/flash` | Flash API docs and OpenAPI spec |

## Run it locally

You need Node 24, pnpm 10, and a Postgres database.

```bash
pnpm install
cp .env.example .env              # then fill it in, see below
pnpm --filter @flashmob/db migrate

pnpm --filter @flashmob/web dev       # site on http://localhost:3000
pnpm --filter @flashmob/worker dev    # bot, listener, auto-copy and agents
```

Both read the root `.env`.

### Environment

| Variable | Used by | What it's for |
| - | - | - |
| `DATABASE_URL` | both | Postgres connection |
| `FLASH_API_KEY` | both | Flash integrator key. The worker requires it. |
| `SESSION_SECRET` | web | Signs sessions: `openssl rand -hex 32` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | both | Privy app, for wallet login |
| `PRIVY_APP_SECRET` | both | Privy server access |
| `NEXT_PUBLIC_PRIVY_SIGNER_ID` | both | The server signer users approve |
| `PRIVY_AUTHORIZATION_KEY` | worker | The key behind that signer |
| `BOT_TOKEN` | worker | Telegram bot token |
| `BOT_USERNAME` | web | Bot name for Connect Telegram links |
| `MODEL_API_KEY` | both | Writes agent plans and runs agents. Agents stay off without it. |
| `APP_URL` | worker | Public https site, for Mini App buttons |
| `NEXT_PUBLIC_PRIVY_TELEGRAM` | web | `true` once Telegram is enabled in Privy |
| `PLATFORM_FEE_BPS` | both | Platform fee. 0 is none, 10 is 0.10%. |
| `AUTO_COPY_ENABLED` | worker | `false` stops auto-copy for everyone. On by default. |
| `BASE_RPC_URL` | worker | Optional Base RPC |
| `BUILDER_CODE` | web | Optional Base builder code |
| `SPIKE_PRIVATE_KEY` | spike | Test wallet for the spike script only |

## Checks

```bash
pnpm typecheck
pnpm test
```

Tests use an in-memory Postgres and fake Flash and Privy clients, so they never touch real funds.

`pnpm spike quote` prices a trade and spends nothing. `market`, `limit` and `bracket` need `SPIKE_PRIVATE_KEY` and `--execute`, and **use real funds**, so only use a dedicated test wallet with a small balance.

## Deploying

- **Website:** Vercel, with `apps/web` as the root directory.
- **Worker:** Railway or any Docker host, built from the repo root: `docker build -f apps/worker/Dockerfile .`
- **Database:** Neon. Run the migrate command against it before deploying a new schema.

Run a single worker. On shutdown it finishes running jobs before it exits.

## Safety

This software trades with real money. Crypto trading can lose everything you put in.

- Your browser signs web orders, and the server only signs for wallets that approved it.
- Before signing, the worker checks that funds stay on Base and can only come back to that same wallet.
- An agent's funds can only be withdrawn to its owner's wallet. The server takes that address from the session and the worker checks it again.
- A job is claimed once and never re-run after a crash, so an order can't be placed twice.
- An order older than a minute is dropped instead of being placed late.
- Plans from the model are only proposals. Every plan must pass the same limits, and strategy text and web results are treated as data, not instructions.

## Status

This is a proof of concept. Server-signed orders and auto-copy have run with real funds.

Not yet proven with real funds:
- Automatic sell mirroring, and a copied bracket
- A stop or target firing
- The newer agent order types: stop buy on a dip, trailing buy, stop limit and trailing stop limit
- Partial agent withdrawals, and Send from your own wallet

Known limits:
- EMA crossovers aren't available to agents yet, so plans use moving averages as a stand-in and say so.
- An agent places its exits after a fill, instead of attaching them to the buy.
- A Telegram account can't link to a web account if both already have trader profiles.
