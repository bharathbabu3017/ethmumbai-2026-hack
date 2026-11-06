// The server checks these byte for byte. The separator is an em dash (U+2014).
export const cancelMessage = (orderId: string) => `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`;

export const batchCancelMessage = (orderIds: string[]) =>
  `Definitive Flash v1 — Cancel Orders\nOrders:\n${orderIds.join("\n")}`;
