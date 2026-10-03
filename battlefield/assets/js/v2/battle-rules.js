/**
 * AUGUR Battlefield 2.0 — deterministic combat rules.
 *
 * Existing production thresholds are preserved:
 * <5k XRP infantry
 * >=5k tank
 * >=25k helicopter
 * >=250k S-14
 *
 * New Battlefield 2.0 event types are additive and configurable.
 */

import { EVENT_CATEGORY, SIDE } from "./market-event.js";

export const DEFAULT_RULES = Object.freeze({
  trade: Object.freeze({
    tankXrp: 5_000,
    helicopterXrp: 25_000,
    s14Xrp: 250_000,
  }),
  orderbook: Object.freeze({
    bunkerImbalance: 0.12,
    fortressImbalance: 0.28,
  }),
  liquidation: Object.freeze({
    artilleryXrp: 25_000,
    helicopterXrp: 75_000,
    airstrikeXrp: 250_000,
  }),
  whale: Object.freeze({
    alertXrp: 100_000,
    reinforcementXrp: 500_000,
  }),
  price: Object.freeze({
    breakoutBps: 25,
    majorBreakoutBps: 75,
  }),
});

function amountXrp(event) {
  if (event.xrp > 0) return event.xrp;
  if (event.usd > 0 && event.price > 0) return event.usd / event.price;
  return 0;
}

export function classifyCombatAction(event, rules = DEFAULT_RULES) {
  const xrp = amountXrp(event);
  const side = event.side;

  if (event.category === EVENT_CATEGORY.ORDERBOOK) {
    const imbalance = Math.abs(Number(event.meta?.imbalance || 0));
    if (side === SIDE.NEUTRAL) {
      return { kind: "liquidity-balance", side, intensity: imbalance, event };
    }
    if (imbalance >= rules.orderbook.fortressImbalance) {
      return { kind: "fortress", side, intensity: imbalance, event };
    }
    if (imbalance >= rules.orderbook.bunkerImbalance) {
      return { kind: "bunker", side, intensity: imbalance, event };
    }
    return { kind: "support-line", side, intensity: imbalance, event };
  }

  if (event.category === EVENT_CATEGORY.LIQUIDATION) {
    if (xrp >= rules.liquidation.airstrikeXrp) {
      return { kind: "airstrike", side, intensity: event.magnitude, event };
    }
    if (xrp >= rules.liquidation.helicopterXrp) {
      return { kind: "helicopter-strike", side, intensity: event.magnitude, event };
    }
    if (xrp >= rules.liquidation.artilleryXrp) {
      return { kind: "artillery", side, intensity: event.magnitude, event };
    }
    return { kind: "explosion", side, intensity: event.magnitude, event };
  }

  if (event.category === EVENT_CATEGORY.XRPL_WHALE) {
    if (xrp >= rules.whale.reinforcementXrp) {
      return { kind: "whale-reinforcement", side, intensity: event.magnitude, event };
    }
    if (xrp >= rules.whale.alertXrp) {
      return { kind: "whale-alert", side, intensity: event.magnitude, event };
    }
    return { kind: "xrpl-signal", side, intensity: event.magnitude, event };
  }

  if (
    event.category === EVENT_CATEGORY.TRADE ||
    event.category === EVENT_CATEGORY.XRPL_PAYMENT ||
    event.category === EVENT_CATEGORY.XRPL_DEX ||
    event.category === EVENT_CATEGORY.XRPL_AMM
  ) {
    if (xrp >= rules.trade.s14Xrp) {
      return { kind: "s14", side, intensity: event.magnitude, event };
    }
    if (xrp >= rules.trade.helicopterXrp) {
      return { kind: "helicopter", side, intensity: event.magnitude, event };
    }
    if (xrp >= rules.trade.tankXrp) {
      return { kind: "tank", side, intensity: event.magnitude, event };
    }
    return { kind: "infantry", side, intensity: event.magnitude, event };
  }

  if (event.category === EVENT_CATEGORY.XRPL_BURN) {
    return { kind: "burn-pulse", side: SIDE.NEUTRAL, intensity: event.magnitude, event };
  }

  if (event.category === EVENT_CATEGORY.VOLATILITY) {
    return { kind: "battle-intensity", side, intensity: event.magnitude, event };
  }

  if (event.category === EVENT_CATEGORY.PRICE) {
    return { kind: "frontline-price", side, intensity: event.magnitude, event };
  }

  return { kind: "telemetry", side, intensity: event.magnitude, event };
}
