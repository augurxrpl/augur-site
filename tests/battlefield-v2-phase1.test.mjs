import assert from "node:assert/strict";
import { normalizeMarketEvent, normalizeOrderBookSnapshot, EVENT_CATEGORY, SIDE } from "../battlefield/assets/js/v2/market-event.js";
import { classifyCombatAction } from "../battlefield/assets/js/v2/battle-rules.js";
import { BattlefieldV2Engine } from "../battlefield/assets/js/v2/battlefield-v2-engine.js";
import { PriceZoneMap } from "../battlefield/assets/js/v2/price-zones.js";

const trade = normalizeMarketEvent({
  source: "Kraken",
  category: EVENT_CATEGORY.TRADE,
  side: SIDE.BUY,
  timestamp: 1,
  xrp: 300000,
  price: 2.50,
  tradeId: "t1",
});
assert.equal(classifyCombatAction(trade).kind, "s14");

const book = normalizeOrderBookSnapshot({
  source: "Coinbase",
  price: 2.50,
  bids: [[2.49, 800000], [2.48, 400000]],
  asks: [[2.51, 100000], [2.52, 100000]],
});
assert.equal(book.side, SIDE.BUY);
assert.equal(classifyCombatAction(book).kind, "fortress");

const accepted = [];
const engine = new BattlefieldV2Engine({
  onAction: a => accepted.push(a.kind),
});
assert.equal(engine.ingest({
  source: "Binance",
  category: EVENT_CATEGORY.TRADE,
  side: SIDE.SELL,
  timestamp: 2,
  xrp: 8000,
  price: 2.50,
  tradeId: "t2",
}).accepted, true);
assert.equal(accepted[0], "tank");

const duplicate = engine.ingest({
  source: "Binance",
  category: EVENT_CATEGORY.TRADE,
  side: SIDE.SELL,
  timestamp: 2,
  xrp: 8000,
  price: 2.50,
  tradeId: "t2",
});
assert.equal(duplicate.accepted, false);

const map = new PriceZoneMap({
  centerPrice: 2.50,
  lowerPrice: 2.00,
  upperPrice: 3.00,
});
assert.equal(map.priceToX(2.00), -52);
assert.equal(map.priceToX(3.00), 52);
assert.equal(map.priceToX(2.50), 0);

console.log("AUGUR Battlefield 2.0 Phase 1 tests passed");
