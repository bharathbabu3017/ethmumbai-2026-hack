"use client";

import {
  BASE_TOKENS, buildOrder, HIGH_COST_PERCENT, ORDER_TYPES, orderCost, prepareOrder, USDC_BY_CHAIN,
  type FlashBalancesResponse, type Holding, type OrderRequest, type OrderStep, type OrderTypeName, type PayChain, type QuoteResponse, type Side,
} from "@flashmob/flash";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AssetChooser, type AssetChoice } from "@/components/asset-chooser";
import { Avatar } from "@/components/avatar";
import { LevelInput } from "@/components/level-input";
import { Nav } from "@/components/nav";
import { OrderProgress } from "@/components/order-progress";
import { OrdersPanel, type OrdersTab } from "@/components/orders-panel";
import { PriceChart } from "@/components/price-chart";
import { TokenPicker, type PickedToken } from "@/components/token-picker";
import { useCached } from "@/lib/cached";
import { flash } from "@/lib/flash";
import { pct, plainError, usd } from "@/lib/format";
import type { TokenStats } from "@/lib/token-stats";
import { useWallet } from "@/lib/wallet";

const QUOTE_REFRESH_MS = 15_000;
const STATS_REFRESH_MS = 30_000;
const MIN_PAY_USD = 0.5;
const SLIPPAGE_CHOICES = ["", "1", "3", "5"];
const compactUsd = (n: number) => `$${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;

interface TokenTrader {
  traderId: string;
  displayName: string;
  filledUsd: number;
  filledQty: number;
}
const CHAIN_NAMES: Record<PayChain, string> = { base: "Base", ethereum: "Ethereum", arbitrum: "Arbitrum", optimism: "Optimism", polygon: "Polygon" };
const EMPTY = { qty: "", price: "", trigger: "", stop: "", target: "", bracketStop: "", bracketTarget: "", bracketStopLimit: "", bracketTargetLimit: "", startInMinutes: "", durationMinutes: "60", slices: "", trailPercent: "5", activationPrice: "", expiryDays: "", maxImpactPercent: "" };
type Fields = typeof EMPTY;

const HINTS: Record<OrderTypeName, string> = {
  market: "Fills now at the best available price.",
  limit: "Fills only at your price or better.",
  stop: "Buys when the price reaches your trigger.",
  "stop-loss": "Sells when the price falls to your trigger.",
  "take-profit": "Sells when the price rises to your trigger.",
  bracket: "Sells at your stop or target, whichever comes first.",
  twap: "Splits your order evenly over time.",
  "trailing-stop": "Follows the price and fires when it reverses by your trail, at market.",
  "trailing-stop-limit": "Follows the price and places a limit order when it reverses by your trail.",
};

/** A token from a link, which may not be one of the listed ones. It's never swapped for a different token. */
function linkedToken(address: string | null, symbol: string | null): PickedToken {
  const listed = BASE_TOKENS.find((t) => t.address.toLowerCase() === address?.toLowerCase());
  if (listed || !address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return listed ?? BASE_TOKENS[0]!;
  return { address, symbol: symbol || `${address.slice(0, 6)}…`, riskFlagged: true };
}

export default function TradePage() {
  return <Suspense><Trade /></Suspense>;
}

function Trade() {
  const { address, actions } = useWallet();
  const params = useSearchParams();
  const linked = params.get("token");
  const [side, setSide] = useState<Side>(params.get("side") === "sell" ? "sell" : "buy");
  const [type, setType] = useState<OrderTypeName>("market");
  const [token, setToken] = useState<PickedToken>(linkedToken(linked, params.get("symbol")));
  const [payChain, setPayChain] = useState<PayChain>("base");
  const [other, setOther] = useState<{ address: string; symbol: string }>();
  const [slippage, setSlippage] = useState("");
  const [direction, setDirection] = useState<"upper" | "lower">("upper");
  const [f, setF] = useState<Fields>(EMPTY);
  const [advanced, setAdvanced] = useState(false);
  const [preview, setPreview] = useState<{ request: OrderRequest; quote: QuoteResponse }>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(0);
  const [step, setStep] = useState<OrderStep>();
  const [tracked, setTracked] = useState<{ orderId: string; market: boolean; side: Side; symbol: string }>();
  const [focus, setFocus] = useState<OrdersTab>();
  const { data: wallet, refresh: loadBalances } = useCached<FlashBalancesResponse["balances"]>(address ? `balances:${address}` : null, () => flash.balances(address!).then((b) => b.balances));
  const balances = wallet ?? [];
  const { data: market, refresh: loadMarket } = useCached<{ stats: TokenStats | null; traders: TokenTrader[] }>(`token:${token.address}`, () => fetch(`/api/token/${token.address}`).then((r) => r.json()));
  const stats = market?.stats ?? null;
  const traders = market?.traders ?? [];

  useEffect(loadBalances, [loadBalances, placed]);
  useEffect(() => {
    const timer = setInterval(loadMarket, STATS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadMarket]);

  const change = () => {
    setPreview(undefined);
    setStatus("");
  };
  const set = (key: keyof Fields) => ({
    value: f[key],
    onChange: (e: { target: { value: string } }) => { setF({ ...f, [key]: e.target.value }); change(); },
  });
  const pickSide = (s: Side) => {
    setSide(s);
    setDirection("upper");
    if (!(ORDER_TYPES[type].sides as readonly string[]).includes(s)) setType("market");
    setPayChain("base");
    setOther(undefined);
    setF({ ...f, qty: "", stop: "", target: "" });
    change();
  };

  // On a buy you spend USDC on the chain you pay from. On a sell you spend the token.
  const spendAsset = side === "buy" ? (other?.address ?? USDC_BY_CHAIN[payChain]).toLowerCase() : token.address.toLowerCase();
  const spendChain = side === "buy" ? payChain : "base";
  const spendBalance = balances.find((b) => b.address.toLowerCase() === spendAsset && b.chain === spendChain)?.balance;
  const spendSymbol = side === "buy" ? other?.symbol ?? "USDC" : token.symbol;
  // Native ETH stays out: it needs wrapping first, and it's what pays for gas.
  const payOptions = balances.filter((b) => b.chain === "base" && !b.isNative && Number(b.notional) >= MIN_PAY_USD
    && b.address.toLowerCase() !== USDC_BY_CHAIN.base.toLowerCase() && b.address.toLowerCase() !== token.address.toLowerCase());

  const reference = (type === "limit" && Number(f.price)) || stats?.price || null;
  const usdcOn = (c: PayChain): AssetChoice => ({ key: c, address: USDC_BY_CHAIN[c], symbol: "USDC", note: c === "base" ? undefined : `${CHAIN_NAMES[c]} (cross-chain)` });
  const assetChoices: AssetChoice[] = [
    usdcOn("base"),
    ...payOptions.map((b) => ({ key: b.address, address: b.address, symbol: b.symbol, note: `$${Number(b.notional).toFixed(2)}` })),
    ...(Object.keys(CHAIN_NAMES) as PayChain[]).filter((c) => c !== "base").map((c) => ({ ...usdcOn(c), moreOnly: true })),
  ];
  const selectedAsset = other ? assetChoices.find((c) => c.key === other.address) ?? { key: other.address, ...other } : usdcOn(payChain);
  const pickAsset = (c: AssetChoice) => {
    const chain = c.key in CHAIN_NAMES ? c.key as PayChain : null;
    setOther(chain ? undefined : { address: c.address, symbol: c.symbol });
    setPayChain(chain ?? "base");
    if (side === "buy") setF({ ...f, qty: "" });
    change();
  };

  const attachable = side === "buy" && (type === "market" || type === "limit" || type === "twap") && payChain === "base";
  const needsTrigger = type === "stop" || type === "stop-loss" || type === "take-profit";
  const trailing = type === "trailing-stop" || type === "trailing-stop-limit";
  const canExpire = type !== "market" && type !== "twap";
  const canLimitImpact = type !== "market";

  const fetchQuote = useCallback(async () => {
    if (!address) throw new Error("Connect a wallet first");
    const built = buildOrder({ ...f, side, type, tokenAddress: token.address, funder: address, payChain, otherToken: other?.address, maxSlippagePercent: type === "market" && payChain === "base" ? slippage : undefined, triggerDirection: direction });
    if ("error" in built) throw new Error(built.error);
    return { request: built.request, quote: await prepareOrder(flash, address, built.request) };
  }, [address, f, side, type, token, payChain, other, slippage, direction]);

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setStatus(plainError(e));
    } finally {
      setBusy(false);
      setStep(undefined);
    }
  };

  const review = run(async () => {
    setTracked(undefined);
    setPreview(await fetchQuote());
  });

  // A market quote goes stale fast, so it's kept fresh while it's on screen.
  useEffect(() => {
    if (!preview || busy || type !== "market") return;
    const timer = setInterval(() => void fetchQuote().then((next) => setPreview((current) => (current ? next : current))).catch(() => setPreview(undefined)), QUOTE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [preview, busy, type, fetchQuote]);

  const confirm = run(async () => {
    if (!preview) return;
    const { orderId } = await actions.place(preview.request, preview.quote, spendChain, setStep);
    setPreview(undefined);
    setF({ ...f, qty: "", stop: "", target: "" });
    setTracked({ orderId, market: type === "market", side, symbol: token.symbol });
    setPlaced((n) => n + 1);
  });

  const sellAll = (h: Holding) => {
    setToken({ symbol: h.symbol, address: h.address, riskFlagged: false });
    setSide("sell");
    setType("market");
    setPayChain("base");
    setOther(undefined);
    setF({ ...EMPTY, qty: h.balance });
    change();
  };

  const held = balances.find((b) => b.chain === "base" && b.address.toLowerCase() === token.address.toLowerCase());
  const change24h = stats?.change24h ?? null;
  const barStats: [string, string, string][] = [
    ["24h change", change24h === null ? "-" : pct(change24h), change24h === null ? "" : change24h < 0 ? "dn" : "up"],
    ["24h volume", stats?.volume24h ? compactUsd(stats.volume24h) : "-", ""],
    ["Liquidity", stats?.liquidity ? compactUsd(stats.liquidity) : "-", ""],
    ["You hold", wallet ? `$${Number(held?.notional ?? 0).toFixed(2)}` : "-", ""],
  ];

  const stepLabel = step === "approving" ? `Approve ${spendSymbol} in your wallet` : step === "signing" ? "Sign in your wallet" : step === "submitting" ? "Placing your order" : "Check your wallet";
  const actionLabel = type === "market" ? `${side === "buy" ? "Buy" : "Sell"} ${token.symbol}` : `Place ${ORDER_TYPES[type].label.toLowerCase()} order`;

  const cost = preview ? orderCost(preview.quote) : null;
  const autoSlippage = preview?.quote.recommendedSlippage;
  const impact = preview?.quote.estimatedPriceImpact;
  const received = side === "buy" ? token.symbol : other?.symbol ?? "USDC";

  return (
    <>
      <Nav />
      <section className="market-bar" aria-label="Market">
        <div className="wrap wide">
          <TokenPicker value={token} onChange={(t) => { setToken(t); setOther(undefined); change(); }} />
          <h1 className="m" style={{ fontSize: 24, fontWeight: 500 }}>{stats ? usd(stats.price) : "-"}</h1>
          {barStats.map(([label, value, tone]) => (
            <div key={label}>
              <div className="stat-label">{label}</div>
              <div className={`m ${tone}`}>{value}</div>
            </div>
          ))}
          <TokenPicker bar value={token} onChange={(t) => { setToken(t); setOther(undefined); change(); }} />
        </div>
      </section>
      <main className="wrap wide cols" style={{ paddingTop: 16, paddingBottom: 48, gap: 16 }}>
        <section className="main" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="panel" style={{ padding: 12 }}>
            <PriceChart key={token.address} token={token.address} height={420} levels={[
              { label: "Limit", price: Number(f.price) || null, tone: "entry" },
              { label: "Trigger", price: needsTrigger ? Number(f.trigger) || null : null, tone: "entry" },
              { label: "Stop", price: Number(type === "bracket" ? f.bracketStop : attachable ? f.stop : 0) || null, tone: "stop" },
              { label: "Target", price: Number(type === "bracket" ? f.bracketTarget : attachable ? f.target : 0) || null, tone: "target" },
            ]} />
          </div>
          <div className="panel"><OrdersPanel reloadKey={placed} focus={focus} onSell={sellAll} /></div>
        </section>

        <aside className="side" style={{ gap: 16 }}>
        <section className="panel" aria-label="Order" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="seg">
            {(["buy", "sell"] as const).map((s) => (
              <button key={s} className={s === side ? "on" : ""} onClick={() => pickSide(s)}>{s}</button>
            ))}
          </div>

          <div>
            <label className="lab" htmlFor="type">Order type</label>
            <select id="type" className="inp" value={type} onChange={(e) => { setType(e.target.value as OrderTypeName); setPayChain("base"); setOther(undefined); change(); }}>
              {(Object.keys(ORDER_TYPES) as OrderTypeName[]).filter((t) => (ORDER_TYPES[t].sides as readonly string[]).includes(side)).map((t) => (
                <option key={t} value={t}>{ORDER_TYPES[t].label}</option>
              ))}
            </select>
            <p className="mut" style={{ margin: "6px 0 0", fontSize: 12 }}>{HINTS[type]}</p>
          </div>

          {type === "market" && (
            <div>
              <AssetChooser label={side === "buy" ? "Pay with" : "Receive"} choices={assetChoices} selected={selectedAsset} onPick={pickAsset} />
            </div>
          )}

          <div>
            <div className="between">
              <label className="lab" htmlFor="qty">{side === "buy" ? `Spend (${spendSymbol})` : `Sell (${token.symbol})`}</label>
              {address && <span className="mut m" style={{ fontSize: 12 }}>{spendBalance ? Number(spendBalance).toFixed(4) : "0"} {spendSymbol}</span>}
            </div>
            <input id="qty" className="inp" inputMode="decimal" {...set("qty")} />
            {spendBalance && (
              <div className="row" style={{ flexWrap: "nowrap", gap: 6, marginTop: 8 }}>
                {[25, 50, 75, 100].map((p) => (
                  <button key={p} className="btn" style={{ flex: "1 1 0", padding: 0, minHeight: 32, fontSize: 12 }} onClick={() => { setF({ ...f, qty: p === 100 ? spendBalance : String(Math.floor(Number(spendBalance) * p * 1e4) / 1e6) }); change(); }}>{p}%</button>
                ))}
              </div>
            )}
          </div>

          {type === "limit" && <div><label className="lab" htmlFor="price">Limit price (USD)</label><input id="price" className="inp" inputMode="decimal" {...set("price")} /></div>}

          {type === "stop" && (
            <div>
              <label className="lab" htmlFor="dir">Buy when the price</label>
              <select id="dir" className="inp" value={direction} onChange={(e) => { setDirection(e.target.value as "upper" | "lower"); change(); }}>
                <option value="upper">Rises to the trigger (breakout)</option>
                <option value="lower">Falls to the trigger (dip)</option>
              </select>
            </div>
          )}

          {needsTrigger && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="trigger">Trigger price (USD)</label><input id="trigger" className="inp" inputMode="decimal" {...set("trigger")} /></div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="price">Limit, optional</label><input id="price" className="inp" inputMode="decimal" {...set("price")} /></div>
            </div>
          )}

          {type === "bracket" && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <LevelInput id="bs" label="Stop loss" direction="below" reference={reference} value={f.bracketStop} onChange={(v) => { setF({ ...f, bracketStop: v }); change(); }} />
              <LevelInput id="bt" label="Take profit" direction="above" reference={reference} value={f.bracketTarget} onChange={(v) => { setF({ ...f, bracketTarget: v }); change(); }} />
            </div>
          )}

          {type === "twap" && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="dur">Run for (minutes)</label><input id="dur" className="inp" inputMode="numeric" {...set("durationMinutes")} /></div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="sl">Slices, optional</label><input id="sl" className="inp" inputMode="numeric" {...set("slices")} /></div>
            </div>
          )}

          {type === "twap" && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="tp">Limit price, optional</label><input id="tp" className="inp" inputMode="decimal" {...set("price")} /></div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="st">Start in (minutes)</label><input id="st" className="inp" inputMode="numeric" placeholder="Now" {...set("startInMinutes")} /></div>
            </div>
          )}

          {trailing && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="tr">Trail (%)</label><input id="tr" className="inp" inputMode="decimal" {...set("trailPercent")} /></div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="ac">Start at, optional</label><input id="ac" className="inp" inputMode="decimal" {...set("activationPrice")} /></div>
            </div>
          )}

          {attachable && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <LevelInput id="stop" label="Stop loss, optional" direction="below" reference={reference} value={f.stop} onChange={(v) => { setF({ ...f, stop: v }); change(); }} />
              <LevelInput id="target" label="Take profit, optional" direction="above" reference={reference} value={f.target} onChange={(v) => { setF({ ...f, target: v }); change(); }} />
            </div>
          )}

          {type === "market" && payChain === "base" && (
            <div>
              <span className="lab">Max slippage</span>
              <div className="row" style={{ gap: 6 }}>
                {SLIPPAGE_CHOICES.map((p) => (
                  <button key={p} className={`asset ${slippage === p ? "sel" : ""}`} aria-pressed={slippage === p} onClick={() => { setSlippage(p); change(); }}>
                    {p ? `${p}%` : autoSlippage ? `Auto (${(Number(autoSlippage) * 100).toFixed(0)}%)` : "Auto"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(canExpire || canLimitImpact) && (
            <button className="mut" style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--mut)" }} onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide" : "Show"} advanced</button>
          )}
          {advanced && type === "bracket" && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="bsl">Stop sells no lower than</label><input id="bsl" className="inp" inputMode="decimal" placeholder="Market" {...set("bracketStopLimit")} /></div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="btl">Target sells no lower than</label><input id="btl" className="inp" inputMode="decimal" placeholder="Market" {...set("bracketTargetLimit")} /></div>
            </div>
          )}
          {advanced && (canExpire || canLimitImpact) && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              {canExpire && <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="exp">Expires in (days)</label><input id="exp" className="inp" inputMode="decimal" placeholder="Never" {...set("expiryDays")} /></div>}
              {canLimitImpact && <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="imp">Max price impact (%)</label><input id="imp" className="inp" inputMode="decimal" placeholder="Default" {...set("maxImpactPercent")} /></div>}
            </div>
          )}

          {token.riskFlagged && <p className="dn" style={{ margin: 0, fontSize: 13 }}>This token is flagged as risky or couldn&apos;t be verified. Check the address carefully: {token.address}</p>}

          {preview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
              <div className="between"><span className="mut">You pay</span><span className="m">{preview.quote.from.amount} {spendSymbol}</span></div>
              <div className="between"><span className="mut">{type === "market" ? "You get about" : "At today's price"}</span><span className="m">{Number(preview.quote.to.amount).toFixed(6)} {received}</span></div>
              {cost ? <div className="between"><span className="mut">Total cost</span><span className={`m ${cost.percent >= HIGH_COST_PERCENT ? "dn" : ""}`}>${cost.usd.toFixed(2)} ({cost.percent.toFixed(1)}%)</span></div> : null}
              {cost && cost.percent >= HIGH_COST_PERCENT && <p role="alert" className="dn" style={{ margin: "6px 0 0", fontSize: 13 }}>This order loses about {cost.percent.toFixed(0)}% to trading costs. Costs are mostly fixed per order, so a larger amount loses a smaller share.</p>}
              {impact && <div className="between"><span className="mut">Price impact</span><span className="m">{(Number(impact) * 100).toFixed(2)}%</span></div>}
              {(slippage || autoSlippage) && <div className="between"><span className="mut">Max slippage</span><span className="m">{slippage ? `${slippage}%` : `${(Number(autoSlippage) * 100).toFixed(1)}% (Auto)`}</span></div>}
              {payChain !== "base" && <p className="mut" style={{ margin: "6px 0 0", fontSize: 13 }}>{side === "buy" ? `Your wallet will switch to ${CHAIN_NAMES[payChain]}.` : `Your USDC arrives on ${CHAIN_NAMES[payChain]}.`} A cross-chain order can&apos;t be cancelled once its funds are moving.</p>}
              <p className="mut" style={{ margin: "6px 0 0", fontSize: 13 }}>This spends real funds.</p>
            </div>
          )}

          {preview
            ? <button className="btn pri" disabled={busy} onClick={confirm}>{busy ? <><span className="spin" />{stepLabel}</> : actionLabel}</button>
            : <button className="btn pri" disabled={busy || !address} onClick={review}>{!address ? "Connect a wallet to trade" : busy ? <><span className="spin" />Getting a quote</> : "Review order"}</button>}
          {preview && !busy && <button className="btn" onClick={change}>Back</button>}
          {status && <p role="alert" className="dn" style={{ margin: 0 }}>{status}</p>}
          {tracked && address && (
            <OrderProgress
              key={tracked.orderId}
              {...tracked}
              funder={address}
              onResting={() => setFocus("Pending orders")}
              onClosed={() => setPlaced((n) => n + 1)}
            />
          )}
        </section>
        {traders.length > 0 && (
          <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ fontSize: 15 }}>Traders on {token.symbol}</h2>
            {traders.map((t) => (
              <div key={t.traderId} className="between" style={{ alignItems: "center" }}>
                <Link href={`/traders/${t.traderId}`} className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
                  <Avatar name={t.displayName} size={32} />
                  <span><span style={{ display: "block", fontWeight: 500 }}>{t.displayName}</span><span className="mut" style={{ fontSize: 12 }}>Bought ${t.filledUsd.toFixed(2)} at {usd(t.filledUsd / t.filledQty)}</span></span>
                </Link>
                <Link href={`/traders/${t.traderId}`} className="btn">View</Link>
              </div>
            ))}
          </section>
        )}
        </aside>
      </main>
    </>
  );
}
