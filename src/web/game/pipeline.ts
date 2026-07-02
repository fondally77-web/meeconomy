/** S02 パイプライン画面（二股）のcanvas描画とフローフェーズ演出 */
import type { MonthlyOrders, MonthlyResult, RouteId, RunState } from '../../game/types.js';
import { stockQty } from '../../game/pipeline/flock.js';
import {
  drawSprite, goodsSprite, PAL,
  SHEEP_A, SHEEP_B, SHORN_A, SHORN_B, LAMB, TRUCK, COIN, WOOLBAG, type Sprite,
} from './sprites.js';
import { SE } from './se.js';

export const CW = 320, CH = 240;
const PEN = { x: 6, y: 44, w: 130, h: 62 };          // 牧場（羊が歩く）
const WOOL_ROAD_Y = 152, MEAT_ROAD_Y = 216;          // 2本の道路（下端基準）

interface Building { label: string; x: number; w: number; lane: 'wool' | 'meat' | 'both'; color: string; dark: string }
const BUILDINGS: Record<string, Building> = {
  wool:    { label: 'ウール',   x: 148, w: 40, lane: 'wool', color: '#4a7fd9', dark: '#2c4f9e' },
  apparel: { label: 'アパレル', x: 200, w: 40, lane: 'wool', color: '#d98ec1', dark: '#a55c8f' },
  meat:    { label: 'ミート',   x: 148, w: 40, lane: 'meat', color: '#c0574b', dark: '#8e3a30' },
  delica:  { label: 'デリカ',   x: 200, w: 40, lane: 'meat', color: '#e2953a', dark: '#b06f22' },
  sales:   { label: 'セールス', x: 254, w: 44, lane: 'both', color: '#3f9e6e', dark: '#2b7a50' },
};

// 区間 → (道路, 始点x, 終点x)
const ROUTE_GEO: Record<RouteId, { lane: 'wool' | 'meat'; from: number; to: number }> = {
  'farm-wool':     { lane: 'wool', from: 10, to: 148 },
  'wool-apparel':  { lane: 'wool', from: 148, to: 200 },
  'apparel-sales': { lane: 'wool', from: 200, to: 254 },
  'farm-meat':     { lane: 'meat', from: 10, to: 148 },
  'meat-delica':   { lane: 'meat', from: 148, to: 200 },
  'meat-sales':    { lane: 'meat', from: 148, to: 254 },
  'delica-sales':  { lane: 'meat', from: 200, to: 254 },
};

interface VisualSheep {
  x: number; y: number; dir: number; walkT: number; pause: number;
  kind: 'wool' | 'shorn' | 'baby';
}
interface FlowTruck { route: RouteId; t: number; delay: number; done: boolean }
interface TimelineEvent { at: number; fn: () => void; fired: boolean }

export type PopFn = (gx: number, gy: number, text: string, color?: string) => void;

export class PipelineView {
  private ctx: CanvasRenderingContext2D;
  private sheep: VisualSheep[] = [];
  private state: RunState | null = null;
  private cloudX = 0;
  private last = performance.now();
  private reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // フローフェーズ
  private flowT = -1;                    // <0 なら待機中
  private flowDur = 0;
  private trucks: FlowTruck[] = [];
  private timeline: TimelineEvent[] = [];
  private onFlowDone: (() => void) | null = null;
  private coinFx: { x: number; y: number; t: number }[] = [];

  constructor(private cv: HTMLCanvasElement, private pop: PopFn) {
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
    cv.addEventListener('pointerdown', () => this.skipFlow());
    requestAnimationFrame(now => this.loop(now));
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
        y: PEN.y + 8 + Math.random() * (PEN.h - 26),
        dir: Math.random() < 0.5 ? -1 : 1,
        walkT: Math.random() * 100, pause: Math.random() * 2, kind: 'wool',
      });
    }
    want.forEach((k, i) => { this.sheep[i].kind = k; });
  }

  get inFlow(): boolean { return this.flowT >= 0; }

  /** フローフェーズ開始（月次シミュレーション結果の演出） */
  startFlow(prev: RunState, orders: MonthlyOrders, result: MonthlyResult, onDone: () => void): void {
    const sheared = Math.max(0, Math.min(orders.sheepToShear, prev.flock.ready));
    this.trucks = [];
    let i = 0;
    for (const [route, n] of Object.entries(orders.truckAssignment) as [RouteId, number][]) {
      if (n > 0) this.trucks.push({ route, t: 0, delay: 0.7 + (i++) * 0.45, done: false });
    }
    this.timeline = [];
    // ✂️毛刈りポン
    for (let k = 0; k < Math.min(sheared, 8); k++) {
      this.timeline.push({
        at: 0.15 + k * 0.22, fired: false,
        fn: () => {
          const s = this.sheep.find(sp => sp.kind === 'wool');
          if (s) {
            s.kind = 'shorn';
            SE.shear(); setTimeout(() => SE.pop(), 90);
            this.pop(s.x + 8, s.y - 8, 'ポンッ！', '#fff');
          }
        },
      });
    }
    // 売上（コイン）
    if (result.soldBoxes > 0) {
      this.timeline.push({
        at: this.flowDurFor() - 1.4, fired: false,
        fn: () => {
          SE.coin();
          this.pop(292, 96, `+${result.cashIn.toLocaleString('ja-JP')}G`, '#ffd24a');
          for (let k = 0; k < 4; k++) this.coinFx.push({ x: 296, y: 110, t: -k * 0.1 });
        },
      });
    }
    // 廃棄
    if (result.disposedBoxes > 0) {
      this.timeline.push({
        at: this.flowDurFor() - 0.9, fired: false,
        fn: () => { SE.deny(); this.pop(160, 200, `廃棄 ${result.disposedBoxes}箱…`, '#ff9c9c'); },
      });
    }
    this.flowDur = this.flowDurFor();
    this.flowT = 0;
    this.onFlowDone = onDone;
    if (this.trucks.length > 0) SE.truck();
  }

  private flowDurFor(): number { return this.reduceMotion ? 2.5 : 5.5; }

  skipFlow(): void {
    if (this.flowT < 0) return;
    for (const ev of this.timeline) if (!ev.fired) { ev.fired = true; ev.fn(); }
    this.flowT = this.flowDur;
  }

  private loop(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.draw(dt);
    requestAnimationFrame(n => this.loop(n));
  }

  private update(dt: number): void {
    for (const s of this.sheep) {
      s.walkT += dt * 6;
      if (s.pause > 0) { s.pause -= dt; continue; }
      s.x += s.dir * 10 * dt;
      if (Math.random() < dt * 0.4) { s.pause = 0.5 + Math.random() * 1.8; if (Math.random() < 0.4) s.dir *= -1; }
      if (s.x < PEN.x + 2) { s.x = PEN.x + 2; s.dir = 1; }
      if (s.x > PEN.x + PEN.w - 20) { s.x = PEN.x + PEN.w - 20; s.dir = -1; }
    }
    for (const c of this.coinFx) c.t += dt;
    this.coinFx = this.coinFx.filter(c => c.t < 1);

    if (this.flowT >= 0) {
      this.flowT += dt;
      for (const ev of this.timeline) {
        if (!ev.fired && this.flowT >= ev.at) { ev.fired = true; ev.fn(); }
      }
      for (const t of this.trucks) {
        if (this.flowT > t.delay && !t.done) {
          t.t += dt / 1.6;
          if (t.t >= 1) t.done = true;
        }
      }
      if (this.flowT >= this.flowDur) {
        this.flowT = -1;
        this.trucks = [];
        const cb = this.onFlowDone;
        this.onFlowDone = null;
        cb?.();
      }
    }
  }

  private draw(dt: number): void {
    const { ctx } = this;
    // 空
    const sky = ctx.createLinearGradient(0, 0, 0, 40);
    sky.addColorStop(0, '#8ec9e8'); sky.addColorStop(1, '#cfe9d8');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, 40);
    if (!this.reduceMotion) this.cloudX = (this.cloudX + dt * 4) % (CW + 60);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    this.cloud(this.cloudX - 30, 14); this.cloud((this.cloudX + 160) % (CW + 60) - 30, 26);
    // 遠景スタジアム
    ctx.fillStyle = PAL.B!;
    ctx.beginPath(); ctx.ellipse(272, 38, 40, 12, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(234, 38, 78, 4);
    // 芝生ベース
    ctx.fillStyle = '#7ec850'; ctx.fillRect(0, 40, CW, CH - 40);
    ctx.fillStyle = '#6fb545';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 37) % CW, 44 + ((i * 23) % (CH - 52)), 2, 2);

    // 牧場（柵）
    ctx.fillStyle = '#8a5a33';
    for (let x = PEN.x; x <= PEN.x + PEN.w; x += 16) ctx.fillRect(x, PEN.y - 4, 3, 14);
    ctx.fillRect(PEN.x, PEN.y - 2, PEN.w, 3); ctx.fillRect(PEN.x, PEN.y + 5, PEN.w, 3);
    ctx.fillStyle = '#f4efe3'; ctx.font = '8px DotGothic16, monospace';
    ctx.fillText('🐑ファーム', PEN.x + 2, PEN.y - 8);

    // 道路2本
    for (const y of [WOOL_ROAD_Y, MEAT_ROAD_Y]) {
      ctx.fillStyle = '#5c6270'; ctx.fillRect(0, y - 16, CW, 18);
      ctx.fillStyle = '#e8e4d8';
      for (let x = 0; x < CW; x += 24) ctx.fillRect(x, y - 8, 10, 2);
    }

    // 建物＋在庫
    if (this.state) {
      for (const [cid, b] of Object.entries(BUILDINGS)) {
        const roadY = b.lane === 'meat' ? MEAT_ROAD_Y : WOOL_ROAD_Y;
        const top = b.lane === 'both' ? WOOL_ROAD_Y - 44 : roadY - 46;
        const h = b.lane === 'both' ? MEAT_ROAD_Y - top - 16 : 28;
        ctx.fillStyle = b.color; ctx.fillRect(b.x, top, b.w, h);
        ctx.fillStyle = b.dark; ctx.fillRect(b.x, top - 5, b.w, 5);
        ctx.fillStyle = '#f4efe3'; ctx.font = '8px DotGothic16, monospace';
        ctx.fillText(b.label, b.x + 3, top + 10);
        this.drawStocks(cid, b.x + 2, top + h - 12);
      }
      // 市場（右端）
      ctx.fillStyle = '#a97b4b'; ctx.fillRect(302, WOOL_ROAD_Y - 44, 16, MEAT_ROAD_Y - WOOL_ROAD_Y + 28);
      ctx.fillStyle = '#f4efe3';
      ctx.fillText('市', 306, WOOL_ROAD_Y - 30); ctx.fillText('場', 306, WOOL_ROAD_Y - 18);
    }

    // 羊
    const sorted = [...this.sheep].sort((a, b) => a.y - b.y);
    for (const s of sorted) {
      const f = Math.floor(s.walkT) % 2 === 0;
      const flip = s.dir < 0;
      const spr: Sprite = s.kind === 'baby' ? LAMB : s.kind === 'wool' ? (f ? SHEEP_A : SHEEP_B) : (f ? SHORN_A : SHORN_B);
      drawSprite(this.ctx, spr, s.x, s.y, 1, flip);
    }

    // フロー中のトラック
    for (const t of this.trucks) {
      if (this.flowT < t.delay || t.done) continue;
      const geo = ROUTE_GEO[t.route];
      const x = geo.from + (geo.to - geo.from) * Math.min(1, t.t);
      const y = (geo.lane === 'wool' ? WOOL_ROAD_Y : MEAT_ROAD_Y) - 15;
      drawSprite(ctx, TRUCK, x, y, 1);
      drawSprite(ctx, WOOLBAG, x + 3, y - 6, 1);
    }

    // コイン演出
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

// stockQty は在庫ヒント表示で他モジュールからも使うため再輸出
export { stockQty };
