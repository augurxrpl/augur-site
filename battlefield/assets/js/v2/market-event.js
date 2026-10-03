/**
 * AUGUR Battlefield 2.0 — normalized market-event contract.
 *
 * No event may enter the battle engine without:
 * source, timestamp, category, side, magnitude, evidence.
 *
 * This file deliberately contains no rendering code.
 */

export const EVENT_CATEGORY = Object.freeze({
  TRADE: "trade",
  ORDERBOOK: "orderbook",
  LIQUIDATION: "liquidation",
  XRPL_PAYMENT: "xrpl_payment",
  XRPL_DEX: "xrpl_dex",
  XRPL_AMM: "xrpl_amm",
  XRPL_WHALE: "xrpl_whale",
  XRPL_BURN: "xrpl_burn",
  XRPL_ACTIVITY: "xrpl_activity",
  VOLATILITY: "volatility",
  PRICE: "price",
});

export const SIDE = Object.freeze({
  BUY: "buy",
  SELL: "sell",
  NEUTRAL: "neutral",
});

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function stableId(parts) {
  const text = parts.map(v => String(v ?? "")).join("|");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `augur-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

export function normalizeMarketEvent(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("normalizeMarketEvent requires an object");
  }

  const source = String(input.source || "").trim();
  const category = String(input.category || "").trim();
  const side = String(input.side || SIDE.NEUTRAL).toLowerCase();
  const timestamp = num(input.timestamp, Date.now());

  if (!source) throw new Error("Market event missing source");
  if (!Object.values(EVENT_CATEGORY).includes(category)) {
    throw new Error(`Unsupported market event category: ${category}`);
  }
  if (!Object.values(SIDE).includes(side)) {
    throw new Error(`Unsupported market event side: ${side}`);
  }

  const xrp = Math.max(0, num(input.xrp));
  const usd = Math.max(0, num(input.usd));
  const price = Math.max(0, num(input.price));
  const size = Math.max(xrp, price > 0 ? usd / price : 0);

  const magnitude = clamp(
    num(input.magnitude, size > 0 ? Math.log10(1 + size) / 7 : 0),
    0,
    1
  );

  const event = Object.freeze({
    id: String(input.id || ((input.txHash || input.tradeId != null)
      ? `${source}:${category}:${input.txHash || input.tradeId}` : stableId([
      source, category, side, timestamp, xrp, usd, price,
      input.txHash, input.tradeId, input.sequence
    ]))),
    source,
    category,
    side,
    timestamp,
    xrp,
    usd,
    price,
    magnitude,
    confidence: clamp(num(input.confidence, 1), 0, 1),
    priceLevel: input.priceLevel == null ? null : Math.max(0, num(input.priceLevel)),
    evidence: Object.freeze({
      txHash: input.txHash ? String(input.txHash) : input.evidence?.txHash ?? null,
      tradeId: input.tradeId != null ? String(input.tradeId) : input.evidence?.tradeId ?? null,
      sequence: input.sequence == null ? input.evidence?.sequence ?? null : String(input.sequence),
      rawType: input.rawType ? String(input.rawType) : input.evidence?.rawType ?? null,
    }),
    meta: Object.freeze({ ...(input.meta || {}) }),
  });

  return event;
}

export function normalizeOrderBookSnapshot({
  source,
  timestamp = Date.now(),
  price,
  bids = [],
  asks = [],
  levels = 20,
}) {
  const p = Math.max(0, num(price));
  const sum = rows =>
    rows.slice(0, levels).reduce((acc, row) => {
      const px = Math.max(0, num(row.price ?? row[0]));
      const qty = Math.max(0, num(row.xrp ?? row.qty ?? row[1]));
      return acc + qty;
    }, 0);

  const bidXrp = sum(bids);
  const askXrp = sum(asks);
  const total = bidXrp + askXrp;
  const imbalance = total > 0 ? (bidXrp - askXrp) / total : 0;

  return normalizeMarketEvent({
    source,
    category: EVENT_CATEGORY.ORDERBOOK,
    side: imbalance > 0.03 ? SIDE.BUY : imbalance < -0.03 ? SIDE.SELL : SIDE.NEUTRAL,
    timestamp,
    price: p,
    xrp: Math.abs(bidXrp - askXrp),
    magnitude: Math.min(1, Math.abs(imbalance)),
    meta: {
      bidXrp,
      askXrp,
      totalXrp: total,
      imbalance,
      levels,
    },
  });
}

export function normalizeLiquidation({
  source,
  timestamp = Date.now(),
  side,
  xrp = 0,
  usd = 0,
  price = 0,
  id = null,
  meta = {},
}) {
  return normalizeMarketEvent({
    source,
    category: EVENT_CATEGORY.LIQUIDATION,
    side,
    timestamp,
    xrp,
    usd,
    price,
    id,
    magnitude: Math.min(1, Math.log10(1 + Math.max(num(xrp), price > 0 ? num(usd) / price : 0)) / 7),
    meta,
  });
}
