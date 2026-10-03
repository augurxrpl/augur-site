/**
 * AUGUR Battlefield 2.0 — live intelligence engine.
 *
 * Rendering is injected through callbacks so this can be wired into the
 * existing battle.js without reopening protected model/orientation code.
 */

import { normalizeMarketEvent, SIDE } from "./market-event.js";
import { classifyCombatAction, DEFAULT_RULES } from "./battle-rules.js";

export class BattlefieldV2Engine {
  constructor({
    rules = DEFAULT_RULES,
    pressureDecay = 0.94,
    maxPressure = 70,
    dedupeMs = 120_000,
    onAction = () => {},
    onTelemetry = () => {},
    now = Date.now,
  } = {}) {
    this.rules = rules;
    this.pressureDecay = pressureDecay;
    this.maxPressure = maxPressure;
    this.dedupeMs = dedupeMs;
    this.onAction = onAction;
    this.onTelemetry = onTelemetry;
    this.now = now;
    this.lastDecay = now();

    this.buyPressure = 0;
    this.sellPressure = 0;
    this.lastPrice = 0;
    this.seen = new Map();
    this.history = [];
    this.maxHistory = 1000;
  }

  pruneSeen(now = Date.now()) {
    const cutoff = now - this.dedupeMs;
    for (const [id, ts] of this.seen) {
      if (ts < cutoff) this.seen.delete(id);
    }
  }

  ingest(input) {
    const event = normalizeMarketEvent(input);
    const receivedAt = this.now();
    this.pruneSeen(receivedAt);

    if (this.seen.has(event.id)) {
      return { accepted: false, reason: "duplicate", event };
    }
    this.seen.set(event.id, receivedAt);
    if (this.seen.size > 50000) this.seen.delete(this.seen.keys().next().value);

    this.decay(receivedAt);

    const directional = ['trade', 'xrpl_dex', 'xrpl_amm', 'liquidation'].includes(event.category);
    const force = directional ? event.magnitude * 10 : 0;
    if (event.side === SIDE.BUY) {
      this.buyPressure = Math.min(this.maxPressure, this.buyPressure + force);
    } else if (event.side === SIDE.SELL) {
      this.sellPressure = Math.min(this.maxPressure, this.sellPressure + force);
    }

    if (event.price > 0 && event.meta.quote !== 'USDT') this.lastPrice = event.price;

    const action = classifyCombatAction(event, this.rules);

    this.history.push({ event, action });
    if (this.history.length > this.maxHistory) this.history.shift();

    const telemetry = this.snapshot();
    this.onTelemetry(telemetry, event);
    this.onAction(action, telemetry);

    return { accepted: true, event, action, telemetry };
  }

  decay(now = this.now()) {
    const elapsed = Math.max(0, now - this.lastDecay);
    const factor = this.pressureDecay ** (elapsed / 250);
    this.buyPressure *= factor;
    this.sellPressure *= factor;
    this.lastDecay = now;
  }

  snapshot() {
    this.decay();
    const total = this.buyPressure + this.sellPressure;
    const buyPct = total > 0 ? (this.buyPressure / total) * 100 : 50;
    const sellPct = total > 0 ? (this.sellPressure / total) * 100 : 50;

    return Object.freeze({
      buyPressure: this.buyPressure,
      sellPressure: this.sellPressure,
      buyPct,
      sellPct,
      lastPrice: this.lastPrice,
      recentEvents: this.history.length,
    });
  }
}

/**
 * Minimal safe bridge for the existing battle.js.
 * Pass callbacks bound to existing production combat functions.
 *
 * Example:
 *   const engine = createBattlefieldV2Bridge({
 *     infantry: ({event}) => existingInfantryPulse(event.side),
 *     tank: ({event}) => existingTankShot(event.side),
 *     ...
 *   });
 */
export function createBattlefieldV2Bridge(handlers = {}, options = {}) {
  return new BattlefieldV2Engine({
    ...options,
    onAction(action, telemetry) {
      const fn = handlers[action.kind] || handlers.default;
      if (typeof fn === "function") fn(action, telemetry);
    },
    onTelemetry(telemetry, event) {
      if (typeof handlers.telemetry === "function") {
        handlers.telemetry(telemetry, event);
      }
    },
  });
}
