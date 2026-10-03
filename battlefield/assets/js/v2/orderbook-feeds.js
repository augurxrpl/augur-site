import { normalizeOrderBookSnapshot } from './market-event.js';

const validRows = rows => Array.isArray(rows) && rows.every(row =>
  Array.isArray(row) && Number.isFinite(Number(row[0])) && Number(row[0]) > 0 &&
  Number.isFinite(Number(row[1])) && Number(row[1]) >= 0);

function bookEvent(source, quote, bids, asks, sequence, receivedAt) {
  bids = bids.filter(row => Number(row[1]) > 0).sort((a,b) => b[0]-a[0]).slice(0,20);
  asks = asks.filter(row => Number(row[1]) > 0).sort((a,b) => a[0]-b[0]).slice(0,20);
  if (!bids.length || !asks.length || Number(bids[0][0]) >= Number(asks[0][0])) throw new Error('Empty or crossed book');
  const price = (Number(bids[0][0]) + Number(asks[0][0])) / 2;
  const event = normalizeOrderBookSnapshot({ source, price, bids, asks, timestamp: receivedAt });
  return { ...event, id: `${source}:orderbook:${sequence}`, sequence,
    meta: { ...event.meta, quote, bids, asks, receivedAt, sequence, scope: 'top-20' } };
}

export class CoinbaseBook {
  constructor() { this.reset(); }
  reset() { this.sequence = null; this.ready = false; this.bids = new Map(); this.asks = new Map(); }
  ingest(message, receivedAt = Date.now()) {
    // Coinbase sequence numbers cover the connection, including heartbeats and subscriptions.
    if (message.channel !== 'l2_data' && message.sequence_num == null) return null;
    const sequence = message.sequence_num;
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('Invalid Coinbase sequence');
    if (this.sequence !== null && sequence <= this.sequence) return null;
    if (this.sequence !== null && sequence !== this.sequence + 1) { this.reset(); throw new Error('Coinbase sequence gap'); }
    this.sequence = sequence;
    if (message.channel !== 'l2_data') return null;
    let changed = false;
    for (const event of message.events || []) {
      if (event.product_id !== 'XRP-USD') continue;
      if (!['snapshot', 'update'].includes(event.type)) throw new Error('Invalid Coinbase book event');
      if (event.type === 'snapshot') { this.bids.clear(); this.asks.clear(); this.ready = true; }
      if (!this.ready) throw new Error('Coinbase update before snapshot');
      if (!Array.isArray(event.updates)) throw new Error('Missing Coinbase levels');
      for (const update of event.updates) {
        const px = Number(update.price_level), qty = Number(update.new_quantity);
        if (!['bid', 'offer'].includes(update.side) || !Number.isFinite(px) || px <= 0 || !Number.isFinite(qty) || qty < 0)
          throw new Error('Invalid Coinbase level');
        const side = update.side === 'bid' ? this.bids : this.asks;
        if (qty === 0) side.delete(px); else side.set(px, qty);
      }
      changed = true;
    }
    this.sequence = sequence;
    if (this.bids.size + this.asks.size > 100000) throw new Error('Coinbase book capacity exceeded');
    return changed ? bookEvent('coinbase', 'USD', [...this.bids], [...this.asks], sequence, receivedAt) : null;
  }
}

export class BinanceBook {
  constructor() { this.reset(); }
  reset() { this.sequence = null; }
  ingest(message, receivedAt = Date.now()) {
    if (!Number.isSafeInteger(message.lastUpdateId) || message.lastUpdateId < 0 ||
      !validRows(message.bids) || !validRows(message.asks)) throw new Error('Invalid Binance partial snapshot');
    if (this.sequence !== null && message.lastUpdateId <= this.sequence) return null;
    // Each partial-depth message replaces the complete top-20 view; sequence gaps are expected.
    const event = bookEvent('binance', 'USDT', message.bids, message.asks, message.lastUpdateId, receivedAt);
    this.sequence = message.lastUpdateId;
    return event;
  }
}

export function connectOrderBooks({ onBook, onStatus = () => {}, WebSocketImpl = WebSocket,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const sources = [
    { name: 'coinbase', url: 'wss://advanced-trade-ws.coinbase.com', adapter: new CoinbaseBook() },
    { name: 'binance', url: 'wss://stream.binance.com:9443/ws/xrpusdt@depth20', adapter: new BinanceBook() },
  ];
  let stopped = false, connectionId = 0;
  for (const state of sources) {
    state.retry = 1000;
    const connect = () => {
      if (stopped) return;
      state.adapter.reset();
      const session = ++connectionId;
      onStatus(state.name, 'connecting');
      let socket, closing = false, retried = false;
      const retry = () => {
        if (stopped || retried) return;
        retried = true;
        onStatus(state.name, 'unavailable');
        clearTimer(state.watchdog);
        state.timer = setTimer(connect, state.retry);
        state.retry = Math.min(state.retry * 2, 30000);
      };
      try { socket = new WebSocketImpl(state.url); } catch { retry(); return; }
      state.socket = socket;
      const close = () => {
        if (closing) return;
        closing = true;
        try { socket.close(); } finally { retry(); }
      };
      const watch = () => {
        clearTimer(state.watchdog);
        state.watchdog = setTimer(() => { onStatus(state.name, 'stale'); close(); }, 15000);
      };
      watch();
      socket.addEventListener('open', () => {
        if (state.name === 'coinbase') {
          for (const channel of ['level2', 'heartbeats']) socket.send(JSON.stringify({ type: 'subscribe', product_ids: ['XRP-USD'], channel }));
        }
      });
      socket.addEventListener('message', ({ data }) => {
        if (stopped || closing || socket !== state.socket) return;
        try {
          const message = JSON.parse(data);
          if (message.type === 'error') throw new Error(message.message || 'Subscription rejected');
          const event = state.adapter.ingest(message, now());
          if (!event) return;
          state.retry = 1000;
          watch();
          onStatus(state.name, 'live');
          onBook({ ...event, id: `${event.id}:connection:${session}` });
        } catch (error) {
          onStatus(state.name, 'resyncing', error.message);
          close();
        }
      });
      socket.addEventListener('close', retry);
      socket.addEventListener('error', close);
    };
    connect();
  }
  return () => {
    stopped = true;
    for (const state of sources) {
      clearTimer(state.timer); clearTimer(state.watchdog); state.socket?.close();
      onStatus(state.name, 'stopped');
    }
  };
}
