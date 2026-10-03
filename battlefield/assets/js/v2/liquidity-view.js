import { PriceZoneMap } from './price-zones.js';

// An independent information layer; never moves or modifies combat models.
export function createLiquidityView({ THREE, scene, document, now = Date.now }) {
  const group = new THREE.Group();
  group.name = 'augur-live-liquidity';
  scene.add(group);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = {
    buy: new THREE.MeshBasicMaterial({ color: 0x258cff, transparent: true, opacity: 0.38 }),
    sell: new THREE.MeshBasicMaterial({ color: 0xff4038, transparent: true, opacity: 0.38 }),
  };
  const levels = [];
  for (const side of ['buy', 'sell']) for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(geometry, materials[side]);
    mesh.visible = false; group.add(mesh); levels.push({ side, index: i, mesh });
  }
  const front = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }));
  front.scale.set(0.12, 0.12, 24); front.position.y = 0.12; group.add(front); front.visible = false;
  const panel = document.createElement('div');
  panel.dataset.bfLiquidity = '';
  panel.style.cssText = 'position:fixed;bottom:76px;left:50%;transform:translateX(-50%);max-width:90vw;padding:6px 10px;border:1px solid #284055;border-radius:6px;background:#05101cdd;color:#cbd9e4;font:10px/1.5 monospace;text-align:center;pointer-events:none;z-index:20';
  document.body.appendChild(panel);
  const books = new Map(), statuses = new Map();
  let map = null, latestPrice = null, priceAt = 0, renderedAt = -Infinity;
  const fresh = at => now() - at < 15000;
  return {
    book(action) { books.set(action.event.source, action); },
    status(source, status) { statuses.set(source, status); if (status !== 'live') books.delete(source); },
    price(price) {
      if (!(Number.isFinite(price) && price > 0)) return;
      latestPrice = price; priceAt = now();
      if (!map || price < map.lowerPrice || price > map.upperPrice)
        map = new PriceZoneMap({ centerPrice: price, lowerPrice: price * 0.998, upperPrice: price * 1.002, worldMinX: -24, worldMaxX: 24 });
    },
    update() {
      if(now() - renderedAt < 250) return;
      renderedAt = now();
      const action = books.get('coinbase');
      const event = action?.event;
      const live = event && fresh(event.meta.receivedAt) && statuses.get('coinbase') === 'live';
      front.visible = !!map && fresh(priceAt);
      if (front.visible) front.position.x = map.priceToX(latestPrice);
      const allRows = live ? [...event.meta.bids, ...event.meta.asks] : [];
      const max = Math.max(1, ...allRows.map(row => Number(row[1])));
      for (const { side, index, mesh } of levels) {
        const row = live ? event.meta[side === 'buy' ? 'bids' : 'asks'][index] : null;
        mesh.visible = !!(row && map && row[0] >= map.lowerPrice && row[0] <= map.upperPrice);
        if (!mesh.visible) continue;
        const height = 0.35 + 2.5 * Number(row[1]) / max;
        mesh.scale.set(action.kind === 'fortress' ? 1.1 : action.kind === 'bunker' ? 0.75 : 0.4, height, 1.1);
        mesh.position.set(map.priceToX(row[0]), height / 2, side === 'buy' ? 6 : 8);
      }
      const labels = ['coinbase', 'binance'].map(source => {
        const book = books.get(source)?.event;
        const status = book && fresh(book.meta.receivedAt) ? 'live' : statuses.get(source) === 'live' ? 'stale' : statuses.get(source) || 'connecting';
        return `${source.toUpperCase()} ${source === 'coinbase' ? 'USD' : 'USDT'} BOOK ${status.toUpperCase()}`;
      });
      panel.textContent = labels.join(' · ') + (live ? ` · ${action.kind.toUpperCase()} ${Math.round(event.meta.imbalance * 100)}%` : '')
        + (map ? ` | USD MAP ${map.lowerPrice.toFixed(4)}–${map.upperPrice.toFixed(4)}` : ' | USD MAP WAITING')
        + ' | LIQUIDATIONS NOT CONNECTED';
    },
  };
}
