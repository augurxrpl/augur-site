/**
 * AUGUR Battlefield 2.0 — price geography.
 *
 * Converts real $XRP price levels into normalized battlefield X coordinates.
 * Does not move objects directly.
 */

export class PriceZoneMap {
  constructor({
    centerPrice,
    lowerPrice,
    upperPrice,
    worldMinX = -52,
    worldMaxX = 52,
  }) {
    this.worldMinX = worldMinX;
    this.worldMaxX = worldMaxX;
    this.setRange({ centerPrice, lowerPrice, upperPrice });
  }

  setRange({ centerPrice, lowerPrice, upperPrice }) {
    const c = Number(centerPrice);
    const lo = Number(lowerPrice);
    const hi = Number(upperPrice);

    if (!(lo > 0 && hi > lo && c >= lo && c <= hi)) {
      throw new Error("Invalid Battlefield price range");
    }

    this.centerPrice = c;
    this.lowerPrice = lo;
    this.upperPrice = hi;
  }

  priceToX(price) {
    const p = Math.max(this.lowerPrice, Math.min(this.upperPrice, Number(price)));
    const t = (p - this.lowerPrice) / (this.upperPrice - this.lowerPrice);
    return this.worldMinX + t * (this.worldMaxX - this.worldMinX);
  }

  xToPrice(x) {
    const xx = Math.max(this.worldMinX, Math.min(this.worldMaxX, Number(x)));
    const t = (xx - this.worldMinX) / (this.worldMaxX - this.worldMinX);
    return this.lowerPrice + t * (this.upperPrice - this.lowerPrice);
  }

  zone(price, bandCount = 12) {
    const p = Number(price);
    const span = this.upperPrice - this.lowerPrice;
    const step = span / bandCount;
    const index = Math.max(0, Math.min(bandCount - 1, Math.floor((p - this.lowerPrice) / step)));
    const from = this.lowerPrice + index * step;
    const to = from + step;
    return {
      index,
      from,
      to,
      center: (from + to) / 2,
      x: this.priceToX((from + to) / 2),
    };
  }
}
