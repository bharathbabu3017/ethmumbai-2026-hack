"use client";

import {
  BASE_TOKENS, buildOrder, ORDER_TYPES, prepareOrder, USDC_BY_CHAIN,
  type FlashBalancesResponse, type OrderRequest, type OrderTypeName, type PayChain, type QuoteResponse, type Side,
} from "@flashmob/flash";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { OrdersPanel } from "@/components/orders-panel";
import { PriceChart } from "@/components/price-chart";
import { TokenPicker, type PickedToken } from "@/components/token-picker";
import { flash } from "@/lib/flash";
import { useWallet } from "@/lib/wallet";

const QUOTE_REFRESH_MS = 15_000;
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

export default function TradePage() {
  return <Suspense><Trade /></Suspense>;
}

function Trade() {
  const { address, actions, miniApp } = useWallet();
  const linked = useSearchParams().get("token")?.toLowerCase();
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderTypeName>("market");
  const [token, setToken] = useState<PickedToken>(BASE_TOKENS.find((t) => t.address.toLowerCase() === linked) ?? BASE_TOKENS[0]!);
  const [payChain, setPayChain] = useState<PayChain>("base");
  const [direction, setDirection] = useState<"upper" | "lower">("upper");
  const [f, setF] = useState<Fields>(EMPTY);
  const [advanced, setAdvanced] = useState(false);
  const [balances, setBalances] = useState<FlashBalancesResponse["balances"]>([]);
  const [preview, setPreview] = useState<{ request: OrderRequest; quote: QuoteResponse }>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(0);

  const loadBalances = useCallback(() => {
    if (address) flash.balances(address).then((b) => setBalances(b.balances)).catch(() => {});
  }, [address]);
  useEffect(loadBalances, [loadBalances, placed]);

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
    setF({ ...f, qty: "", stop: "", target: "" });
    change();
  };

  // On a buy you spend USDC on the chain you pay from. On a sell you spend the token.
  const spendAsset = side === "buy" ? USDC_BY_CHAIN[payChain].toLowerCase() : token.address.toLowerCase();
  const spendChain = side === "buy" ? payChain : "base";
  const spendBalance = balances.find((b) => b.address.toLowerCase() === spendAsset && b.chain === spendChain)?.balance;
  const spendSymbol = side === "buy" ? "USDC" : token.symbol;

  const attachable = side === "buy" && (type === "market" || type === "limit" || type === "twap") && payChain === "base";
  const needsTrigger = type === "stop" || type === "stop-loss" || type === "take-profit";
  const trailing = type === "trailing-stop" || type === "trailing-stop-limit";
  const canExpire = type !== "market" && type !== "twap";
  const canLimitImpact = type !== "market";

  const fetchQuote = useCallback(async () => {
    if (!address) throw new Error("Connect a wallet first");
    const built = buildOrder({ ...f, side, type, tokenAddress: token.address, funder: address, payChain, triggerDirection: direction });
    if ("error" in built) throw new Error(built.error);
    return { request: built.request, quote: await prepareOrder(flash, address, built.request) };
  }, [address, f, side, type, token, payChain, direction]);

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const review = run(async () => setPreview(await fetchQuote()));

  // A market quote goes stale fast, so it's kept fresh while it's on screen.
  useEffect(() => {
    if (!preview || busy || type !== "market") return;
    const timer = setInterval(() => void fetchQuote().then((next) => setPreview((current) => (current ? next : current))).catch(() => setPreview(undefined)), QUOTE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [preview, busy, type, fetchQuote]);

  const confirm = run(async () => {
    if (!preview) return;
    const { orderId } = await actions.place(preview.request, preview.quote, spendChain);
    setPreview(undefined);
    setF({ ...f, qty: "" });
    setPlaced((n) => n + 1);
    setStatus(`Order placed: ${orderId}`);
  });

  const slippage = preview?.quote.recommendedSlippage;
  const impact = preview?.quote.estimatedPriceImpact;
  const received = side === "buy" ? token.symbol : "USDC";

  return (
    <>
      <Nav />
      <main className="wrap cols" style={{ paddingTop: 36, paddingBottom: 64 }}>
        <section className="main" style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <div>
            <h1 className="big" style={{ marginBottom: 16 }}>{token.symbol}</h1>
            <PriceChart key={token.address} token={token.address} height={420} levels={[
              { label: "Limit", price: Number(f.price) || null, tone: "entry" },
              { label: "Trigger", price: needsTrigger ? Number(f.trigger) || null : null, tone: "entry" },
              { label: "Stop", price: Number(type === "bracket" ? f.bracketStop : attachable ? f.stop : 0) || null, tone: "stop" },
              { label: "Target", price: Number(type === "bracket" ? f.bracketTarget : attachable ? f.target : 0) || null, tone: "target" },
            ]} />
          </div>
          <OrdersPanel reloadKey={placed} />
        </section>

        <section className="side" style={{ gap: 14 }}>
          <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
            {(["buy", "sell"] as const).map((s) => (
              <button key={s} className={`btn ${s === side ? "on" : ""}`} style={{ flex: "1 1 0", textTransform: "capitalize" }} onClick={() => pickSide(s)}>{s}</button>
            ))}
          </div>

          <TokenPicker value={token} onChange={(t) => { setToken(t); change(); }} />

          <div>
            <label className="lab" htmlFor="type">Order type</label>
            <select id="type" className="inp" value={type} onChange={(e) => { setType(e.target.value as OrderTypeName); setPayChain("base"); change(); }}>
              {(Object.keys(ORDER_TYPES) as OrderTypeName[]).filter((t) => (ORDER_TYPES[t].sides as readonly string[]).includes(side)).map((t) => (
                <option key={t} value={t}>{ORDER_TYPES[t].label}</option>
              ))}
            </select>
            <p className="mut" style={{ margin: "6px 0 0", fontSize: 12 }}>{HINTS[type]}</p>
          </div>

          {type === "market" && !miniApp && (
            <div>
              <label className="lab" htmlFor="pay">{side === "buy" ? "Pay with USDC on" : "Receive USDC on"}</label>
              <select id="pay" className="inp" value={payChain} onChange={(e) => { setPayChain(e.target.value as PayChain); change(); }}>
                {(Object.keys(CHAIN_NAMES) as PayChain[]).map((c) => <option key={c} value={c}>{CHAIN_NAMES[c]}{c === "base" ? "" : " (cross-chain)"}</option>)}
              </select>
            </div>
          )}

          <div>
            <div className="between">
              <label className="lab" htmlFor="qty">{side === "buy" ? "Spend (USDC)" : `Sell (${token.symbol})`}</label>
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
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="bs">Stop loss (USD)</label><input id="bs" className="inp" inputMode="decimal" {...set("bracketStop")} /></div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="bt">Take profit (USD)</label><input id="bt" className="inp" inputMode="decimal" {...set("bracketTarget")} /></div>
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
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="stop">Stop loss, optional</label><input id="stop" className="inp" inputMode="decimal" {...set("stop")} /></div>
              <div style={{ flex: "1 1 0", minWidth: 0 }}><label className="lab" htmlFor="target">Take profit, optional</label><input id="target" className="inp" inputMode="decimal" {...set("target")} /></div>
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
              <div className="between"><span className="mut">Estimated fees</span><span className="m">${preview.quote.fees.estimatedFeeNotional}</span></div>
              {impact && <div className="between"><span className="mut">Price impact</span><span className="m">{(Number(impact) * 100).toFixed(2)}%</span></div>}
              {slippage && <div className="between"><span className="mut">Max slippage</span><span className="m">{(Number(slippage) * 100).toFixed(1)}%</span></div>}
              {payChain !== "base" && <p className="mut" style={{ margin: "6px 0 0", fontSize: 13 }}>{side === "buy" ? `Your wallet will switch to ${CHAIN_NAMES[payChain]}.` : `Your USDC arrives on ${CHAIN_NAMES[payChain]}.`} A cross-chain order can&apos;t be cancelled once its funds are moving.</p>}
              <p className="mut" style={{ margin: "6px 0 0", fontSize: 13 }}>This spends real funds.</p>
            </div>
          )}

          {preview
            ? <button className="btn pri" disabled={busy} onClick={confirm}>{busy ? (miniApp ? "Placing order" : "Check your wallet") : miniApp ? "Place order" : "Confirm in wallet"}</button>
            : <button className="btn pri" disabled={busy || !address} onClick={review}>{address ? (busy ? "Getting quote" : "Review order") : "Connect a wallet to trade"}</button>}
          {status && <p role="status" style={{ margin: 0 }}>{status}</p>}
        </section>
      </main>
    </>
  );
}
