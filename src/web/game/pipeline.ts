/** S02 パイプライン画面：マップ描画＋お仕事体験（✂️/🔪・輸送・開店）の演出 */
import type { GoodsId, MonthlyResult, RouteId, RunState } from '../../game/types.js';
import {
  drawSprite, goodsSprite, PAL,
  SHEEP_A, SHEEP_B, SHORN_A, SHORN_B, LAMB, TRUCK, COIN,
  WOOLBAG, YARNROLL, MEATBOX, type Sprite,
} from './sprites.js';
import { SE } from './se.js';

export const CW = 320, CH = 240;
const PEN = { x: 6, y: 44, w: 130, h: 62 };          // 牧場（羊が歩く）
const WOOL_ROAD_Y = 152, MEAT_ROAD_Y = 216;          // 2本の道路（下端基準）
const DEPOT = { x: 6, y: 162, w: 46, h: 32 };        // ロジ車庫

interface Building { label: string; x: number; w: number; lane: 'wool' | 'meat' | 'both'; color: string; dark: string }
const BUILDINGS: Record<string, Building> = {
  wool:    { label: 'ウール',   x: 148, w: 40, lane: 'wool', color: '#4a7fd9', dark: '#2c4f9e' },
  apparel: { label: 'アパレル', x: 200, w: 40, lane: 'wool', color: '#d98ec1', dark: '#a55c8f' },
  meat:    { label: 'ミート',   x: 148, w: 40, lane: 'meat', color: '#c0574b', dark: '#8e3a30' },
  delica:  { label: 'デリカ',   x: 200, w: 40, lane: 'meat', color: '#e2953a', dark: '#b06f22' },
  sales:   { label: 'セールス', x: 254, w: 44, lane: 'both', color: '#3f9e6e', dark: '#2b7a50' },
};

const ROUTE_GEO: Record<RouteId, { lane: 'wool' | 'meat'; from: number; to: number }> = {
  'farm-wool':     { lane: 'wool', from: 10, to: 148 },
  'wool-apparel':  { lane: 'wool', from: 148, to: 200 },
  'apparel-sales': { lane: 'wool', from: 200, to: 254 },
  'farm-meat':     { lane: 'meat', from: 60, to: 148 },
  'meat-delica':   { lane: 'meat', from: 148, to: 200 },
  'meat-sales':    { lane: 'meat', from: 148, to: 254 },
  'delica-sales':  { lane: 'meat', from: 200, to: 254 },
};

/** 中間在庫の山（お仕事体験中にマップへ描く） */
export interface Overlay {
  farmWool: number;      // 刈った毛（牧場の毛袋の山）
  shipWait: number;      // 出荷待ちの羊（肉道路の乗り場）
  woolWool: number; woolYarn: number;
  meatSheep: number; meatMeat: number;
  delicaMeat: number; delicaGoods: number;
  apparelYarn: number; apparelGoods: number;
  salesBoxes: number;
}
const PILE_SPOTS: Record<keyof Overlay, { x: number; y: number; sprite: Sprite }> = {
  farmWool:     { x: 104, y: 92, sprite: WOOLBAG },
  shipWait:     { x: 62, y: 184, sprite: LAMB },
  woolWool:     { x: 150, y: 122, sprite: WOOLBAG },
  woolYarn:     { x: 172, y: 122, sprite: YARNROLL },
  meatSheep:    { x: 150, y: 186, sprite: LAMB },
  meatMeat:     { x: 172, y: 186, sprite: MEATBOX },
  delicaMeat:   { x: 202, y: 174, sprite: MEATBOX },
  delicaGoods:  { x: 202, y: 186, sprite: goodsSprite('genghis') },
  apparelYarn:  { x: 202, y: 110, sprite: YARNROLL },
  apparelGoods: { x: 202, y: 122, sprite: goodsSprite('muffler') },
  salesBoxes:   { x: 256, y: 180, sprite: goodsSprite('muffler') },
};

export type Tool = 'shear' | 'ship' | null;

interface VisualSheep {
  x: number; y: number; dir: number; walkT: number; pause: number;
  kind: 'wool' | 'shorn' | 'baby';
  shearedNow: boolean;   // 今月刈った（✂️マーク）
  leaving: boolean;      // 出荷されて退場中
}
interface Transport { route: RouteId; goods: GoodsId | null; t: number; onDone?: () => void }
interface FlyFx { sprite: Sprite; sx: number; sy: number; tx: number; ty: number; t: number; onLand?: () => void }
interface TimelineEvent { at: number; fn: () => void; fired: boolean }

export type PopFn = (gx: number, gy: number, text: string, color?: string) => void;

export interface MapHandlers {
  /** ✂️で羊を刈ってよいか（毛刈り班の上限など。falseなら理由はapp側で表示） */
  canShear(): boolean;
  onSheared(): void;
  canShip(): boolean;
  onShipped(): void;
  /** 建物・車庫タップ（ガイド表示用） */
  onTap(id: string): void;
}

export class PipelineView {
  private ctx: CanvasRenderingContext2D;
  private sheep: VisualSheep[] = [];
  private state: RunState | null = null;
  private overlay: Overlay | null = null;
  private tool: Tool = null;
  private trucksLeft = 0;
  private cloudX = 0;
  private last = performance.now();
  private reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private transports: Transport[] = [];
  private flys: FlyFx[] = [];
  private coinFx: { x: number; y: number; t: number }[] = [];

  // 開店（月末売上）演出
  private marketT = -1;
  private marketDur = 0;
  private timeline: TimelineEvent[] = [];
  private onMarketDone: (() => void) | null = null;

  constructor(private cv: HTMLCanvasElement, private pop: PopFn, private handlers: MapHandlers) {
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
    cv.addEventListener('pointerdown', e => this.onPointer(e));
    requestAnimationFrame(now => this.loop(now));
  }

  setTool(tool: Tool): void { this.tool = tool; }
  setOverlay(o: Overlay | null): void { this.overlay = o ? { ...o } : null; }
  setTrucksLeft(n: number): void { this.trucksLeft = n; }
  get busy(): boolean { return this.transports.length > 0 || this.marketT >= 0; }

  // ── 入力 ──
  private onPointer(e: PointerEvent): void {
    if (this.marketT >= 0) { this.skipMarket(); return; }
    const r = this.cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * CW;
    const y = ((e.clientY - r.top) / r.height) * CH;
    const hit = [...this.sheep].sort((a, b) => b.y - a.y).find(s =>
      !s.leaving && x >= s.x - 2 && x <= s.x + 18 && y >= s.y - 4 && y <= s.y + 14);
    if (hit && this.tool) { this.onSheepTap(hit); return; }
    for (const [cid, b] of Object.entries(BUILDINGS)) {
      const roadY = b.lane === 'meat' ? MEAT_ROAD_Y : WOOL_ROAD_Y;
      const top = (b.lane === 'both' ? WOOL_ROAD_Y - 44 : roadY - 46) - 5;
      const h = (b.lane === 'both' ? MEAT_ROAD_Y - (WOOL_ROAD_Y - 44) - 16 : 28) + 5;
      if (x >= b.x && x <= b.x + b.w && y >= top && y <= top + h) { this.handlers.onTap(cid); return; }
    }
    if (x >= DEPOT.x && x <= DEPOT.x + DEPOT.w && y >= DEPOT.y - 6 && y <= DEPOT.y + DEPOT.h) {
      this.handlers.onTap('logi');
    }
  }

  private onSheepTap(s: VisualSheep): void {
    if (this.tool === 'shear') {
      if (s.kind === 'baby') { SE.mee(); this.pop(s.x + 8, s.y - 8, 'めぇ！（まだ子羊）', '#ffd24a'); return; }
      if (s.kind === 'shorn') {
        SE.mee();
        this.pop(s.x + 8, s.y - 8, s.shearedNow ? 'もう刈りました' : 'メェ…（回復待ち）', '#ffd24a');
        return;
      }
      if (!this.handlers.canShear()) { SE.mee(); return; }
      s.kind = 'shorn'; s.shearedNow = true;
      SE.shear(); setTimeout(() => SE.pop(), 90);
      this.pop(s.x + 8, s.y - 10, 'ポンッ！', '#fff');
      const spot = PILE_SPOTS.farmWool;
      this.flys.push({
        sprite: WOOLBAG, sx: s.x + 4, sy: s.y - 4,
        tx: spot.x, ty: spot.y, t: 0,
        onLand: () => this.handlers.onSheared(),
      });
    } else if (this.tool === 'ship') {
      if (s.kind === 'baby') { SE.mee(); this.pop(s.x + 8, s.y - 8, 'めぇ！（まだ子羊）', '#ffd24a'); return; }
      if (!this.handlers.canShip()) { SE.mee(); return; }
      s.leaving = true; s.dir = 1; s.pause = 0;
      SE.mee();
      this.pop(s.x + 8, s.y - 8, '🔪出荷…', '#ff9c9c');
      this.handlers.onShipped();
    }
  }

  /** 群れの頭数に合わせて牧場の羊を同期 */
  setState(s: RunState): void {
    this.state = s;
    const want: VisualSheep['kind'][] = [
      ...Array<'wool'>(s.flock.ready).fill('wool'),
      ...Array<'shorn'>(s.flock.cd1 + s.flock.cd2).fill('shorn'),
      ...Array<'baby'>(s.flock.lambs).fill('baby'),
    ].slice(0, 24);
    while (this.sheep.length > want.length) this.sheep.pop();
    while (this.sheep.length < want.length) {
      this.sheep.push({
        x: PEN.x + 6 + Math.random() * (PEN.w - 28),
        y: PEN.y + 14 + Math.random() * (PEN.h - 32),
        dir: Math.random() < 0.5 ? -1 : 1,
        walkT: Math.random() * 100, pause: Math.random() * 2,
        kind: 'wool', shearedNow: false, leaving: false,
      });
    }
    want.forEach((k, i) => {
      this.sheep[i].kind = k;
      this.sheep[i].shearedNow = false;
      this.sheep[i].leaving = false;
    });
  }

  /** トラック輸送を1回走らせる（qty>0のときだけ呼ぶ） */
  animateTransport(route: RouteId, goods: GoodsId | null, onDone?: () => void): void {
    SE.truck();
    this.transports.push({ route, goods, t: 0, onDone });
  }

  // ── 開店（売上）演出 ──
  startMarket(result: MonthlyResult, onDone: () => void): void {
    this.marketDur = this.reduceMotion ? 1.2 : 2.6;
    this.marketT = 0;
    this.onMarketDone = onDone;
    this.timeline = [];
    if (result.soldBoxes > 0) {
      this.timeline.push({
        at: 0.3, fired: false,
        fn: () => {
          SE.coin();
          this.pop(292, 96, `+${result.cashIn.toLocaleString('ja-JP')}G`, '#ffd24a');
          for (let k = 0; k < 5; k++) this.coinFx.push({ x: 296, y: 110, t: -k * 0.12 });
        },
      });
    } else {
      this.timeline.push({
        at: 0.3, fired: false,
        fn: () => { SE.deny(); this.pop(292, 96, '売るものがない…', '#ff9c9c'); },
      });
    }
    if (result.disposedBoxes > 0) {
      this.timeline.push({
        at: this.marketDur - 0.8, fired: false,
        fn: () => { SE.deny(); this.pop(180, 200, `廃棄 ${result.disposedBoxes}箱…`, '#ff9c9c'); },
      });
    }
  }

  skipMarket(): void {
    if (this.marketT < 0) return;
    for (const ev of this.timeline) if (!ev.fired) { ev.fired = true; ev.fn(); }
    this.marketT = this.marketDur;
  }

  // ── ループ ──
  private loop(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.draw(dt);
    requestAnimationFrame(n => this.loop(n));
  }

  private update(dt: number): void {
    for (const s of [...this.sheep]) {
      s.walkT += dt * 6;
      if (s.leaving) {
        s.x += 46 * dt;
        s.y += (184 - s.y) * dt * 1.6;   // 出荷乗り場へ
        if (s.x > PILE_SPOTS.shipWait.x - 6) this.sheep.splice(this.sheep.indexOf(s), 1);
        continue;
      }
      if (s.pause > 0) { s.pause -= dt; continue; }
      s.x += s.dir * 10 * dt;
      if (Math.random() < dt * 0.4) { s.pause = 0.5 + Math.random() * 1.8; if (Math.random() < 0.4) s.dir *= -1; }
      if (s.x < PEN.x + 2) { s.x = PEN.x + 2; s.dir = 1; }
      if (s.x > PEN.x + PEN.w - 20) { s.x = PEN.x + PEN.w - 20; s.dir = -1; }
    }
    for (const f of [...this.flys]) {
      f.t += dt * 1.8;
      if (f.t >= 1) { f.onLand?.(); this.flys.splice(this.flys.indexOf(f), 1); }
    }
    for (const tr of [...this.transports]) {
      tr.t += dt / 1.3;
      if (tr.t >= 1) { tr.onDone?.(); this.transports.splice(this.transports.indexOf(tr), 1); }
    }
    for (const c of this.coinFx) c.t += dt;
    this.coinFx = this.coinFx.filter(c => c.t < 1);

    if (this.marketT >= 0) {
      this.marketT += dt;
      for (const ev of this.timeline) if (!ev.fired && this.marketT >= ev.at) { ev.fired = true; ev.fn(); }
      if (this.marketT >= this.marketDur) {
        this.marketT = -1;
        const cb = this.onMarketDone;
        this.onMarketDone = null;
        cb?.();
      }
    }
  }

  // ── 描画 ──
  private draw(dt: number): void {
    const { ctx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, 40);
    sky.addColorStop(0, '#8ec9e8'); sky.addColorStop(1, '#cfe9d8');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, 40);
    if (!this.reduceMotion) this.cloudX = (this.cloudX + dt * 4) % (CW + 60);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    this.cloud(this.cloudX - 30, 14); this.cloud((this.cloudX + 160) % (CW + 60) - 30, 26);
    ctx.fillStyle = PAL.B!;
    ctx.beginPath(); ctx.ellipse(272, 38, 40, 12, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(234, 38, 78, 4);
    ctx.fillStyle = '#7ec850'; ctx.fillRect(0, 40, CW, CH - 40);
    ctx.fillStyle = '#6fb545';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 37) % CW, 44 + ((i * 23) % (CH - 52)), 2, 2);

    // 牧場
    ctx.fillStyle = '#8a5a33';
    for (let x = PEN.x; x <= PEN.x + PEN.w; x += 16) ctx.fillRect(x, PEN.y - 4, 3, 14);
    ctx.fillRect(PEN.x, PEN.y - 2, PEN.w, 3); ctx.fillRect(PEN.x, PEN.y + 5, PEN.w, 3);
    ctx.fillStyle = '#f4efe3'; ctx.font = '8px DotGothic16, monospace';
    ctx.fillText('🐑ファーム', PEN.x + 2, PEN.y - 8);

    // 道路
    for (const y of [WOOL_ROAD_Y, MEAT_ROAD_Y]) {
      ctx.fillStyle = '#5c6270'; ctx.fillRect(0, y - 16, CW, 18);
      ctx.fillStyle = '#e8e4d8';
      for (let x = 0; x < CW; x += 24) ctx.fillRect(x, y - 8, 10, 2);
    }

    // 建物
    if (this.state) {
      for (const [cid, b] of Object.entries(BUILDINGS)) {
        const roadY = b.lane === 'meat' ? MEAT_ROAD_Y : WOOL_ROAD_Y;
        const top = b.lane === 'both' ? WOOL_ROAD_Y - 44 : roadY - 46;
        const h = b.lane === 'both' ? MEAT_ROAD_Y - top - 16 : 28;
        ctx.fillStyle = b.color; ctx.fillRect(b.x, top, b.w, h);
        ctx.fillStyle = b.dark; ctx.fillRect(b.x, top - 5, b.w, 5);
        ctx.fillStyle = '#f4efe3'; ctx.font = '8px DotGothic16, monospace';
        ctx.fillText(b.label, b.x + 3, top + 10);
        if (!this.overlay) this.drawStocks(cid, b.x + 2, top + h - 12);
      }
      // 市場
      ctx.fillStyle = '#a97b4b'; ctx.fillRect(302, WOOL_ROAD_Y - 44, 16, MEAT_ROAD_Y - WOOL_ROAD_Y + 28);
      ctx.fillStyle = '#f4efe3';
      ctx.fillText('市', 306, WOOL_ROAD_Y - 30); ctx.fillText('場', 306, WOOL_ROAD_Y - 18);
      // 車庫
      ctx.fillStyle = '#6b7280'; ctx.fillRect(DEPOT.x, DEPOT.y, DEPOT.w, DEPOT.h);
      ctx.fillStyle = '#4b5563'; ctx.fillRect(DEPOT.x, DEPOT.y - 5, DEPOT.w, 5);
      ctx.fillStyle = '#f4efe3';
      ctx.fillText(`🚚のこり${this.trucksLeft}`, DEPOT.x + 2, DEPOT.y + 10);
      for (let i = 0; i < Math.min(this.trucksLeft, 4); i++) {
        drawSprite(ctx, TRUCK, DEPOT.x + (i % 2) * 20 - 2, DEPOT.y + 12 + Math.floor(i / 2) * 9, 0.7);
      }
    }

    // 中間在庫の山
    if (this.overlay) {
      for (const [key, spot] of Object.entries(PILE_SPOTS) as [keyof Overlay, typeof PILE_SPOTS[keyof Overlay]][]) {
        const n = this.overlay[key];
        if (n <= 0) continue;
        const show = Math.min(3, n);
        for (let i = 0; i < show; i++) drawSprite(this.ctx, spot.sprite, spot.x + i * 5, spot.y - i * 2, 1);
        ctx.fillStyle = '#fff'; ctx.font = '8px DotGothic16, monospace';
        ctx.fillText(`x${n}`, spot.x + show * 5 + 6, spot.y + 8);
      }
    }

    // 羊
    const sorted = [...this.sheep].sort((a, b) => a.y - b.y);
    for (const s of sorted) {
      const f = Math.floor(s.walkT) % 2 === 0;
      const flip = s.dir < 0;
      const spr: Sprite = s.kind === 'baby' ? LAMB : s.kind === 'wool' ? (f ? SHEEP_A : SHEEP_B) : (f ? SHORN_A : SHORN_B);
      drawSprite(this.ctx, spr, s.x, s.y, 1, flip);
      if (s.shearedNow) { ctx.font = '8px sans-serif'; ctx.fillText('✂️', s.x + 4, s.y - 2); }
    }

    // 飛翔エフェクト（毛袋）
    for (const fl of this.flys) {
      const t = Math.min(1, fl.t);
      const x = fl.sx + (fl.tx - fl.sx) * t;
      const y = fl.sy + (fl.ty - fl.sy) * t - Math.sin(t * Math.PI) * 30;
      drawSprite(ctx, fl.sprite, x, y, 1);
    }

    // 輸送トラック
    for (const tr of this.transports) {
      const geo = ROUTE_GEO[tr.route];
      const x = geo.from + (geo.to - geo.from) * Math.min(1, tr.t);
      const y = (geo.lane === 'wool' ? WOOL_ROAD_Y : MEAT_ROAD_Y) - 15;
      drawSprite(ctx, TRUCK, x, y, 1);
      if (tr.goods) drawSprite(ctx, goodsSprite(tr.goods), x + 3, y - 7, 1);
    }

    // コイン
    for (const c of this.coinFx) {
      if (c.t < 0) continue;
      drawSprite(ctx, COIN, 292 + Math.sin(c.t * 9) * 6, 104 - c.t * 36, 1);
    }
  }

  private drawStocks(cid: string, x: number, y: number): void {
    if (!this.state) return;
    const stock = this.state.companies[cid as keyof RunState['companies']]?.stock ?? [];
    const total = stock.reduce((t, l) => t + l.qty, 0);
    if (total <= 0) return;
    const first = stock.find(l => l.qty > 0);
    if (!first) return;
    const n = Math.min(3, total);
    for (let i = 0; i < n; i++) drawSprite(this.ctx, goodsSprite(first.goodsId), x + i * 7, y, 1);
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '8px DotGothic16, monospace';
    this.ctx.fillText(`x${total}`, x + n * 7 + 3, y + 8);
  }

  private cloud(x: number, y: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.ellipse(x, y, 16, 7, 0, 0, 7);
    ctx.ellipse(x + 14, y - 4, 12, 7, 0, 0, 7);
    ctx.ellipse(x + 26, y + 1, 13, 6, 0, 0, 7);
    ctx.fill();
  }
}
