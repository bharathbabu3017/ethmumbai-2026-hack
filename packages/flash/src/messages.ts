// The server checks these byte for byte. The separator is an em dash (U+2014).
export const cancelMessage = (orderId: string) => `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`;

export const batchCancelMessage = (orderIds: string[]) =>
  `Definitive Flash v1 — Cancel Orders\nOrders:\n${orderIds.join("\n")}`;

export interface EditableOrder {
  orderType: string;
  limitNotionalPrice?: string | null;
  limitCrossPrice?: string | null;
  trigger?: { notionalPrice?: string; crossPrice?: string; triggerType: "upper" | "lower" } | null;
  brackets?: { notionalPrice?: string; crossPrice?: string; triggerType: "upper" | "lower"; limitPrice?: string }[] | null;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** The one or two prices an order lets you edit, in the order the edit form shows them. */
export function editableFields(o: EditableOrder) {
  if (o.orderType === "limit") return ["limit"] as const;
  if (o.orderType === "bracket" && o.brackets?.length === 2) return ["stop", "target"] as const;
  if (o.trigger && ["stop", "stop-loss", "take-profit"].includes(o.orderType)) return ["trigger"] as const;
  return [] as const;
}

/** Builds the signed message and body for PATCH /orders/{id}. Trigger direction and basis must stay as placed. */
export function buildUpdate(orderId: string, o: EditableOrder, next: { limit?: string; trigger?: string; stop?: string; target?: string }, issuedAt: string) {
  const lines = ["Definitive Flash — Update Order", `Order: ${orderId}`, `Issued At: ${issuedAt}`];
  const basis = (l: { crossPrice?: string }) => (l.crossPrice !== undefined && l.crossPrice !== null ? "crossPrice" : "notionalPrice");

  if (o.orderType === "limit") {
    const cross = !!o.limitCrossPrice;
    lines.push(`Limit ${cross ? "Cross" : "Notional"} Price: ${next.limit}`);
    return { message: lines.join("\n"), body: cross ? { limitCrossPrice: next.limit } : { limitNotionalPrice: next.limit } };
  }

  if (o.orderType === "bracket" && o.brackets) {
    const legs = [...o.brackets].sort((a) => (a.triggerType === "lower" ? -1 : 1));
    const triggers = legs.map((leg) => {
      const key = basis(leg);
      const price = leg.triggerType === "lower" ? next.stop : next.target;
      lines.push(`Trigger ${cap(leg.triggerType)} ${key === "crossPrice" ? "Cross" : "Notional"} Price: ${price}`);
      // An update replaces both legs, so a limit the leg already has must be sent again.
      if (leg.limitPrice) lines.push(`Trigger ${cap(leg.triggerType)} Limit Price: ${leg.limitPrice}`);
      return { [key]: price, triggerType: leg.triggerType, ...(leg.limitPrice ? { limitPrice: leg.limitPrice } : {}) };
    });
    return { message: lines.join("\n"), body: { triggers } };
  }

  const t = o.trigger!;
  const key = basis(t);
  lines.push(`Trigger ${cap(t.triggerType)} ${key === "crossPrice" ? "Cross" : "Notional"} Price: ${next.trigger}`);
  return { message: lines.join("\n"), body: { trigger: { [key]: next.trigger, triggerType: t.triggerType } } };
}
