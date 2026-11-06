"use client";

import { CandlestickSeries, ColorType, createChart, LineStyle, type AutoscaleInfo, type IChartApi, type IPriceLine, type ISeriesApi } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { pricePrecision, TIMEFRAMES, type Candle, type Timeframe } from "@/lib/chart";

export interface PriceLevel {
  label: string;
  price: number | null;
  tone: "entry" | "stop" | "target";
}

const RETRY_MS = 6_000;
const MAX_RETRIES = 8;

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const theme = () => ({
  layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: cssVar("--mut"), fontFamily: "inherit" },
  grid: { vertLines: { visible: false }, horzLines: { color: cssVar("--line") } },
  rightPriceScale: { borderColor: cssVar("--line") },
  timeScale: { borderColor: cssVar("--line"), timeVisible: true },
});

const candleColors = () => {
  const up = cssVar("--up");
  const down = cssVar("--orange");
  return { upColor: up, wickUpColor: up, borderUpColor: up, downColor: down, wickDownColor: down, borderDownColor: down };
};

const toneColor = (tone: PriceLevel["tone"]) => cssVar(tone === "stop" ? "--orange" : tone === "target" ? "--up" : "--mut");

export function PriceChart({ token, levels = [], height = 340 }: { token: string; levels?: PriceLevel[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>(null);
  const series = useRef<ISeriesApi<"Candlestick">>(null);
  const lines = useRef<{ line: IPriceLine; tone: PriceLevel["tone"] }[]>([]);
  const prices = useRef<number[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!box.current) return;
    const created = createChart(box.current, { autoSize: true, ...theme() });
    chart.current = created;
    series.current = created.addSeries(CandlestickSeries, {
      ...candleColors(),
      // Price lines don't widen the scale by themselves, so a far-off stop would be invisible.
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const info = base();
        if (!info?.priceRange) return info;
        const { minValue, maxValue } = info.priceRange;
        return { ...info, priceRange: { minValue: Math.min(minValue, ...prices.current), maxValue: Math.max(maxValue, ...prices.current) } };
      },
    });
    // Canvas colors don't follow CSS, so they are reapplied when the theme changes.
    const observer = new MutationObserver(() => {
      created.applyOptions(theme());
      series.current?.applyOptions(candleColors());
      lines.current.forEach(({ line, tone }) => line.applyOptions({ color: toneColor(tone) }));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      created.remove();
      chart.current = null;
      series.current = null;
      lines.current = [];
    };
  }, []);

  useEffect(() => {
    let stale = false;
    let retry: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const load = async () => {
      const res = await fetch(`/api/chart?token=${token}&timeframe=${timeframe}`).catch(() => undefined);
      if (stale) return;
      if (!res || res.status === 503) {
        // The free data source is rate limited, so wait for it instead of giving up.
        if (++attempts > MAX_RETRIES) return setMessage("Chart data is busy right now. Try again shortly.");
        setMessage("Loading chart…");
        retry = setTimeout(load, RETRY_MS);
        return;
      }
      const json = await res.json();
      if (stale || !series.current) return;
      if (!res.ok) {
        series.current.setData([]);
        return setMessage(json.error);
      }
      const candles = json.candles as Candle[];
      const precision = pricePrecision(candles.at(-1)!.close);
      series.current.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
      series.current.setData(candles.map((c) => ({ ...c, time: c.time as never })));
      chart.current?.timeScale().fitContent();
      setMessage("");
    };

    setMessage("Loading chart…");
    void load();
    return () => {
      stale = true;
      clearTimeout(retry);
    };
  }, [token, timeframe]);

  const key = levels.map((l) => `${l.label}:${l.price}`).join("|");
  useEffect(() => {
    const target = series.current;
    if (!target) return;
    lines.current.forEach(({ line }) => target.removePriceLine(line));
    prices.current = levels.flatMap((l) => (l.price !== null && l.price > 0 ? [l.price] : []));
    lines.current = levels
      .filter((l) => l.price !== null && l.price > 0)
      .map((l) => ({
        tone: l.tone,
        line: target.createPriceLine({ price: l.price!, title: l.label, color: toneColor(l.tone), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true }),
      }));
    chart.current?.priceScale("right").applyOptions({ autoScale: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div>
      <div className="row" style={{ gap: 4, marginBottom: 10 }}>
        {(Object.keys(TIMEFRAMES) as Timeframe[]).map((t) => (
          <button key={t} className={`btn ${t === timeframe ? "on" : ""}`} style={{ minHeight: 32, padding: "0 10px", fontSize: 12 }} onClick={() => setTimeframe(t)}>{t}</button>
        ))}
      </div>
      <div style={{ position: "relative", height }}>
        <div ref={box} style={{ position: "absolute", inset: 0 }} />
        {message && <p className="mut" style={{ position: "absolute", inset: 0, margin: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{message}</p>}
      </div>
      <p className="mut" style={{ margin: "6px 0 0", fontSize: 11 }}>Market data from GeckoTerminal and DEX Screener</p>
    </div>
  );
}
