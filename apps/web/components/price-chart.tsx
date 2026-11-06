"use client";

import { CandlestickSeries, ColorType, createChart, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { pricePrecision, TIMEFRAMES, type Candle, type Timeframe } from "@/lib/chart";

export interface PriceLevel {
  label: string;
  price: number | null;
  tone: "entry" | "stop" | "target";
}

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
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!box.current) return;
    const created = createChart(box.current, { autoSize: true, ...theme() });
    chart.current = created;
    series.current = created.addSeries(CandlestickSeries, candleColors());
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
    setError("");
    fetch(`/api/chart?token=${token}&timeframe=${timeframe}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        return json.candles as Candle[];
      })
      .then((candles) => {
        if (stale || !series.current) return;
        if (!candles.length) throw new Error("No market data for this token");
        const precision = pricePrecision(candles.at(-1)!.close);
        series.current.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
        series.current.setData(candles.map((c) => ({ ...c, time: c.time as never })));
        chart.current?.timeScale().fitContent();
      })
      .catch((e) => {
        if (stale) return;
        series.current?.setData([]);
        setError(e instanceof Error && e.message ? e.message : "Market data is unavailable right now");
      });
    return () => {
      stale = true;
    };
  }, [token, timeframe]);

  const key = levels.map((l) => `${l.label}:${l.price}`).join("|");
  useEffect(() => {
    const target = series.current;
    if (!target) return;
    lines.current.forEach(({ line }) => target.removePriceLine(line));
    lines.current = levels
      .filter((l) => l.price !== null && l.price > 0)
      .map((l) => ({
        tone: l.tone,
        line: target.createPriceLine({ price: l.price!, title: l.label, color: toneColor(l.tone), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true }),
      }));
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
        {error && <p className="mut" style={{ position: "absolute", inset: 0, margin: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{error}</p>}
      </div>
      <p className="mut" style={{ margin: "6px 0 0", fontSize: 11 }}>Market data from GeckoTerminal</p>
    </div>
  );
}
