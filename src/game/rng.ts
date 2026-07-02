/** mulberry32：シード付き乱数（テスト再現性・「同じ年度をもう一回」用） */
export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return {
    next(): number {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState(): number { return s >>> 0; },
    setState(v: number) { s = v >>> 0; },
  };
}
export type Rng = ReturnType<typeof mulberry32>;
