import { createChartData } from "@flashmob/flash";

export { ChartBusy, createChartData, NoMarketData } from "@flashmob/flash";

const shared = globalThis as unknown as { candleData?: ReturnType<typeof createChartData> };
export const getCandles = (shared.candleData ??= createChartData());
