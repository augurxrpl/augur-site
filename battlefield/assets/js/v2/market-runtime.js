import { createBattlefieldV2Bridge } from './battlefield-v2-engine.js';

const combatTypes = Object.freeze({
  infantry: 'infantry_volley', tank: 'tank_artillery',
  helicopter: 'helicopter_strike', s14: 'warplane_airstrike',
});

// Rendering remains owned by battle.js. Only proven trades enter its combat queue.
export function createMarketRuntime({ queue, onTrade = () => {}, onBook = () => {},
  onTelemetry = () => {}, now = Date.now } = {}) {
  const engine = createBattlefieldV2Bridge({
    default(action) {
      const event = action.event;
      if (event.category === 'orderbook') { onBook(action); return; }
      const type = combatTypes[action.kind];
      if (!type || !['trade', 'xrpl_dex', 'xrpl_amm'].includes(event.category)) return;
      if (!['buy', 'sell'].includes(event.side) || event.xrp < 0.01) return;
      queue({ type, side: event.side === 'buy' ? 'blue' : 'red',
        intensity: action.kind === 's14' ? 3 : Math.min(3, 0.7 + Math.log10(event.xrp + 1) * 0.48),
        source: event.source, hash: event.evidence.txHash || event.evidence.tradeId || event.id,
        xrpAmount: event.xrp, marketEvent: event });
      onTrade(event);
    },
    telemetry: onTelemetry,
  }, { now });
  return {
    engine,
    trade({ source, side, xrp, price, tradeId, txHash, timestamp, quote = 'USD', category = 'trade' }) {
      if (!['blue', 'red'].includes(side) || !Number.isFinite(Number(xrp)) || Number(xrp) < 0.01
        || (!tradeId && tradeId !== 0 && !txHash)) return { accepted: false, reason: 'invalid-trade' };
      return engine.ingest({ source, category, side: side === 'blue' ? 'buy' : 'sell',
        xrp, price, tradeId, txHash, timestamp, meta: { quote } });
    },
    book(event) { return engine.ingest(event); },
    ledger({ hash, type, timestamp }) {
      if (!hash) return { accepted: false, reason: 'missing-hash' };
      // Transfers and unproven executions have no directional market meaning.
      return engine.ingest({ source: 'xrpl', category: type === 'Payment' ? 'xrpl_payment' : 'xrpl_activity',
        side: 'neutral', txHash: hash, timestamp, rawType: type, magnitude: 0,
        meta: { telemetryOnly: true, classification: type === 'Payment' ? 'payment' : 'ledger-activity' } });
    },
  };
}
