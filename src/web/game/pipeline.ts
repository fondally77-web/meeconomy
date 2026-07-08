/** S02 パイプライン画面：シーン切替式（牧場ズーム／マップ俯瞰／作業場／工房／店先） */
import type { GoodsId, MonthlyResult, RouteId, RunState } from '../../game/types.js';
import {
  drawSprite, goodsSprite, PAL,
  SHEEP_A, SHEEP_B, SHORN_A, SHORN_B, LAMB, TRUCK, COIN, CUSTOMER,
  WOOLBAG, YARNROLL, MEATBOX, type Sprite,
} from './sprites.js';
import { SE } from './se.js';

export const CW = 320, CH = 240;
const PEN = { x: 6, y: 44, w: 130, h: 62 };          // マップ上の牧場（論理座標）
const WOOL_ROAD_Y = 152, MEAT_ROAD_Y = 216;
const DEPOT = { x: 6, y: 162, w: 46, h: 32 };

// ファームズーム時の牧場（羊は2倍サイズで歩く）
const PEN_BIG = { x: 8, y: 64, w: 240, h: 148 };

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

export interface Overlay {
  farmWool: number; shipWait: number;
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

export type Scene = 'map' | 'farm' | 'work' | 'craft' | 'market';
export type Tool = 'shear' | 'ship' | null;

interface VisualSheep {
  x: number; y: number; dir: number; walkT: number; pause: number;
  kind: 'wool' | 'shorn' | 'baby';
  shearedNow: boolean;
  leaving: boolean;
  golden: boolean;             // レアなキラキラ羊（見た目のごほうび）
}
interface Customer { x: number; y: number; t: number; delay: number; phase: 'in' | 'buy' | 'out' }
interface Transport { route: RouteId; goods: GoodsId | null; t: number; onDone?: () => void }
interface FlyFx { sprite: Sprite; scene: Scene; scale: number; sx: number; sy: number; tx: number; ty: number; t: number; onLand?: () => void }
interface TimelineEvent { at: number; fn: () => void; fired: boolean }

export type PopFn = (gx: number, gy: number, text: string, color?: string) => void;

export interface MapHandlers {
  canShear(): boolean;
  onSheared(): void;
  canShip(): boolean;
  onShipped(): void;
  /** 作業場シーンでのタップ（左=紡績・右=と畜） */
  onWorkTap(kind: 'spin' | 'slaughter'): void;
  onTap(id: string): void;
}

export class PipelineView {
  private ctx: CanvasRenderingContext2D;
  private sheep: VisualSheep[] = [];
  private state: RunState | null = null;
  private overlay: Overlay | null = null;
  private tool: Tool = null;
  private trucksLeft = 0;
  private scene: Scene = 'map';
  private fade = 0;                      // シーン切替の黒フェード（1→0）
  private cloudX = 0;
  private last = performance.now();
  private reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private transports: Transport[] = [];
  private flys: FlyFx[] = [];
  private coinFx: { x: number; y: number; t: number; big: boolean }[] = [];

  private marketT = -1;
  private marketDur = 0;
  private timeline: TimelineEvent[] = [];
  private onMarketDone: (() => void) | null = null;
  private customers: (Customer & { targetX: number })[] = [];
  private marketBought = 0;
  private marketSoldTotal = 0;

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
  setScene(scene: Scene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.fade = this.reduceMotion ? 0 : 1;
  }
  get currentScene(): Scene { return this.scene; }
  get busy(): boolean { return this.transports.length > 0 || this.marketT >= 0; }

  // ── ファームズーム座標変換 ──
  private farmX(x: number): number { return PEN_BIG.x + (x - PEN.x) * (PEN_BIG.w / PEN.w); }
  private farmY(y: number): number { return PEN_BIG.y + (y - PEN.y) * (PEN_BIG.h / PEN.h); }

  // ── 入力 ──
  private onPointer(e: PointerEvent): void {
    if (this.marketT >= 0) { this.skipMarket(); return; }
    const r = this.cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * CW;
    const y = ((e.clientY - r.top) / r.height) * CH;

    if (this.scene === 'farm' && this.tool) {
      const hit = [...this.sheep].sort((a, b) => b.y - a.y).find(s => {
        if (s.leaving) return false;
        const sx = this.farmX(s.x), sy = this.farmY(s.y);
        return x >= sx - 4 && x <= sx + 36 && y >= sy - 8 && y <= sy + 28;
      });
      if (hit) { this.onSheepTap(hit); return; }
      return;
    }
    if (this.scene === 'work') {
      this.handlers.onWorkTap(x < CW / 2 ? 'spin' : 'slaughter');
      return;
    }
    if (this.scene === 'map') {
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
  }

  private shearFx(s: VisualSheep, onLand?: () => void): void {
    const sx = this.farmX(s.x), sy = this.farmY(s.y);
    s.kind = 'shorn'; s.shearedNow = true;
    SE.shear(); setTimeout(() => SE.pop(), 90);
    this.pop(sx + 16, sy - 12, s.golden ? '✨キラキラの毛！' : 'ポンッ！', s.golden ? '#ffd24a' : '#fff');
    this.flys.push({
      sprite: WOOLBAG, scene: 'farm', scale: 2,
      sx: sx + 8, sy: sy - 6, tx: 36, ty: 196, t: 0,
      onLand,
    });
  }

  private shipFx(s: VisualSheep): void {
    const sx = this.farmX(s.x), sy = this.farmY(s.y);
    s.leaving = true; s.dir = 1; s.pause = 0;
    SE.mee();
    this.pop(sx + 16, sy - 10, '🔪出荷…', '#ff9c9c');
  }

  private onSheepTap(s: VisualSheep): void {
    const sx = this.farmX(s.x), sy = this.farmY(s.y);
    if (this.tool === 'shear') {
      if (s.kind === 'baby') { SE.mee(); this.pop(sx + 16, sy - 10, 'めぇ！（まだ子羊）', '#ffd24a'); return; }
      if (s.kind === 'shorn') {
        SE.mee();
        this.pop(sx + 16, sy - 10, s.shearedNow ? 'もう刈りました' : 'メェ…（回復待ち）', '#ffd24a');
        return;
      }
      if (!this.handlers.canShear()) { SE.mee(); return; }
      this.shearFx(s, () => this.handlers.onSheared());
    } else if (this.tool === 'ship') {
      if (s.kind === 'baby') { SE.mee(); this.pop(sx + 16, sy - 10, 'めぇ！（まだ子羊）', '#ffd24a'); return; }
      if (!this.handlers.canShip()) { SE.mee(); return; }
      this.shipFx(s);
      this.handlers.onShipped();
    }
  }

  /** おまかせ再生：1頭刈る（対象がいなければfalse） */
  autoShearOne(onLand?: () => void): boolean {
    const s = this.sheep.find(sp => sp.kind === 'wool' && !sp.leaving);
    if (!s) return false;
    this.shearFx(s, onLand);
    return true;
  }

  /** おまかせ再生：1頭出荷（毛刈り済みを優先して残す挙動はエンジンと同じくcd優先） */
  autoShipOne(): boolean {
    const s = this.sheep.find(sp => !sp.leaving && sp.kind === 'shorn')
      ?? this.sheep.find(sp => !sp.leaving && sp.kind === 'wool');
    if (!s) return false;
    this.shipFx(s);
    return true;
  }

  /** 子羊を1頭ふやす／へらす（購入プレビュー） */
  addLamb(): void {
    SE.buy();
    this.sheep.push({
      x: PEN.x + 6 + Math.random() * (PEN.w - 28),
      y: PEN.y + 14 + Math.random() * (PEN.h - 32),
      dir: 1, walkT: Math.random() * 100, pause: 0,
      kind: 'baby', shearedNow: false, leaving: false, golden: Math.random() < 0.05,
    });
    const last = this.sheep[this.sheep.length - 1];
    this.pop(this.farmX(last.x) + 10, this.farmY(last.y) - 8,
      last.golden ? '✨金色の子羊！？' : 'めぇ！', last.golden ? '#ffd24a' : '#9fd0ff');
  }

  removeLamb(): void {
    const idx = this.sheep.map(s => s.kind).lastIndexOf('baby');
    if (idx >= 0) this.sheep.splice(idx, 1);
  }

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
        kind: 'wool', shearedNow: false, leaving: false, golden: Math.random() < 0.03,
      });
    }
    want.forEach((k, i) => {
      this.sheep[i].kind = k;
      this.sheep[i].shearedNow = false;
      this.sheep[i].leaving = false;
    });
  }

  animateTransport(route: RouteId, goods: GoodsId | null, onDone?: () => void): void {
    SE.truck();
    this.transports.push({ route, goods, t: 0, onDone });
  }

  /** 作業場・工房での「できた！」演出（大きい商品が飛び出す） */
  craftPop(side: 'left' | 'right', sprite: Sprite): void {
    const x = side === 'left' ? 60 : 220;
    this.flys.push({
      sprite, scene: this.scene, scale: 2,
      sx: x, sy: 150, tx: x + 40, ty: 120, t: 0,
    });
  }

  startMarket(result: MonthlyResult, onDone: () => void): void {
    const n = Math.min(result.soldBoxes, 8);
    this.customers = [];
    this.marketBought = 0;
    this.marketSoldTotal = result.soldBoxes;
    this.marketDur = this.reduceMotion ? 1.2 : Math.max(2.6, 1.6 + n * 0.5);
    this.marketT = 0;
    this.onMarketDone = onDone;
    this.timeline = [];
    const big = this.scene === 'market';
    const cx = big ? 160 : 292, cy = big ? 120 : 96;
    if (result.soldBoxes > 0 && big && !this.reduceMotion) {
      // お客さんが1人ずつ来て買っていく
      for (let i = 0; i < n; i++) {
        this.customers.push({
          x: 330 + i * 8, y: 196, t: 0, delay: 0.3 + i * 0.45,
          phase: 'in', targetX: 250 - i * 26,
        });
      }
    }
    if (result.soldBoxes > 0) {
      this.timeline.push({
        at: this.marketDur - 1.2, fired: false,
        fn: () => {
          SE.coin();
          this.pop(cx, cy, `+${result.cashIn.toLocaleString('ja-JP')}G`, '#ffd24a');
          for (let k = 0; k < 6; k++) this.coinFx.push({ x: cx + (k - 3) * 14, y: cy + 20, t: -k * 0.1, big });
        },
      });
    } else {
      this.timeline.push({
        at: 0.3, fired: false,
        fn: () => { SE.deny(); this.pop(cx, cy, '売るものがない…', '#ff9c9c'); },
      });
    }
    if (result.disposedBoxes > 0) {
      this.timeline.push({
        at: this.marketDur - 0.8, fired: false,
        fn: () => { SE.deny(); this.pop(cx, cy + 60, `廃棄 ${result.disposedBoxes}箱…`, '#ff9c9c'); },
      });
    }
  }

  skipMarket(): void {
    if (this.marketT < 0) return;
    for (const ev of this.timeline) if (!ev.fired) { ev.fired = true; ev.fn(); }
    this.customers = [];
    this.marketBought = this.marketSoldTotal;
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
    this.fade = Math.max(0, this.fade - dt * 4);
    for (const s of [...this.sheep]) {
      s.walkT += dt * 6;
      if (s.leaving) {
        s.x += 46 * dt;
        if (s.x > PEN.x + PEN.w + 20) this.sheep.splice(this.sheep.indexOf(s), 1);
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
      // お客さん：来店→購入（カチーン）→退店
      for (const c of [...this.customers]) {
        if (this.marketT < c.delay) continue;
        if (c.phase === 'in') {
          c.x -= 95 * dt;
          if (c.x <= c.targetX) { c.x = c.targetX; c.phase = 'buy'; c.t = 0; SE.kaching(); this.coinFx.push({ x: c.x, y: 160, t: 0, big: true }); this.marketBought += this.marketSoldTotal / Math.max(1, this.customers.length); }
        } else if (c.phase === 'buy') {
          c.t += dt;
          if (c.t > 0.35) c.phase = 'out';
        } else {
          c.x += 120 * dt;
          if (c.x > CW + 20) this.customers.splice(this.customers.indexOf(c), 1);
        }
      }
      for (const ev of this.timeline) if (!ev.fired && this.marketT >= ev.at) { ev.fired = true; ev.fn(); }
      if (this.marketT >= this.marketDur) {
        this.marketT = -1;
        this.customers = [];
        const cb = this.onMarketDone;
        this.onMarketDone = null;
        cb?.();
      }
    }
  }

  // ── 描画 ──
  private draw(dt: number): void {
    switch (this.scene) {
      case 'farm': this.drawFarm(dt); break;
      case 'work': this.drawWorkshop('🧶ウール社', '#2c4f9e', '#4a7fd9', '🥩ミート社', '#8e3a30', '#c0574b'); break;
      case 'craft': this.drawWorkshop('👕アパレル社', '#a55c8f', '#d98ec1', '🍖デリカ社', '#b06f22', '#e2953a'); break;
      case 'market': this.drawMarket(); break;
      default: this.drawMap(dt); break;
    }
    // 飛翔（現在のシーンのものだけ）
    for (const fl of this.flys) {
      if (fl.scene !== this.scene) continue;
      const t = Math.min(1, fl.t);
      const x = fl.sx + (fl.tx - fl.sx) * t;
      const y = fl.sy + (fl.ty - fl.sy) * t - Math.sin(t * Math.PI) * 34;
      drawSprite(this.ctx, fl.sprite, x, y, fl.scale);
    }
    for (const c of this.coinFx) {
      if (c.t < 0) continue;
      drawSprite(this.ctx, COIN, c.x + Math.sin(c.t * 9) * 6, c.y - c.t * 40, c.big ? 2 : 1);
    }
    if (this.fade > 0) {
      this.ctx.fillStyle = `rgba(13,16,48,${this.fade})`;
      this.ctx.fillRect(0, 0, CW, CH);
    }
  }

  private skyAndGrass(groundY: number, dt: number): void {
    const { ctx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#8ec9e8'); sky.addColorStop(1, '#cfe9d8');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, groundY);
    if (!this.reduceMotion) this.cloudX = (this.cloudX + dt * 4) % (CW + 60);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    this.cloud(this.cloudX - 30, 16); this.cloud((this.cloudX + 160) % (CW + 60) - 30, 30);
    ctx.fillStyle = '#7ec850'; ctx.fillRect(0, groundY, CW, CH - groundY);
    ctx.fillStyle = '#6fb545';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 37) % CW, groundY + 4 + ((i * 23) % (CH - groundY - 8)), 2, 2);
  }

  // ── ①ファームズーム ──
  private drawFarm(dt: number): void {
    const { ctx } = this;
    this.skyAndGrass(56, dt);
    // 遠景スタジアム
    ctx.fillStyle = PAL.B!;
    ctx.beginPath(); ctx.ellipse(280, 54, 36, 10, 0, Math.PI, 0); ctx.fill();
    // 柵（大）
    ctx.fillStyle = '#8a5a33';
    for (let x = PEN_BIG.x; x <= PEN_BIG.x + PEN_BIG.w; x += 24) ctx.fillRect(x, PEN_BIG.y - 8, 5, 22);
    ctx.fillRect(PEN_BIG.x, PEN_BIG.y - 5, PEN_BIG.w, 5); ctx.fillRect(PEN_BIG.x, PEN_BIG.y + 7, PEN_BIG.w, 5);
    ctx.fillStyle = '#f4efe3'; ctx.font = '10px DotGothic16, monospace';
    ctx.fillText('🐑ファーム', 10, 16);
    // 出荷乗り場（右端）
    ctx.fillStyle = '#5c6270'; ctx.fillRect(262, 120, 58, 100);
    ctx.fillStyle = '#e8e4d8';
    for (let y = 130; y < 214; y += 22) ctx.fillRect(286, y, 2, 10);
    drawSprite(ctx, TRUCK, 266, 140, 1.5);
    ctx.fillStyle = '#f4efe3'; ctx.font = '9px DotGothic16, monospace';
    ctx.fillText('出荷', 284, 116);
    if (this.overlay && this.overlay.shipWait > 0) {
      for (let i = 0; i < Math.min(3, this.overlay.shipWait); i++) drawSprite(ctx, LAMB, 268 + i * 14, 190 - i * 4, 1.5);
      ctx.fillText(`x${this.overlay.shipWait}`, 296, 214);
    }
    // 毛袋の山（左下・大）
    if (this.overlay && this.overlay.farmWool > 0) {
      const n = Math.min(4, this.overlay.farmWool);
      for (let i = 0; i < n; i++) drawSprite(ctx, WOOLBAG, 18 + i * 12, 200 - i * 6, 2);
      ctx.fillStyle = '#fff'; ctx.font = '10px DotGothic16, monospace';
      ctx.fillText(`x${this.overlay.farmWool}`, 24 + n * 12, 216);
    }
    // 羊（2倍）
    const sorted = [...this.sheep].sort((a, b) => a.y - b.y);
    for (const s of sorted) {
      const f = Math.floor(s.walkT) % 2 === 0;
      const flip = s.dir < 0;
      const spr: Sprite = s.kind === 'baby' ? LAMB : s.kind === 'wool' ? (f ? SHEEP_A : SHEEP_B) : (f ? SHORN_A : SHORN_B);
      drawSprite(ctx, spr, this.farmX(s.x), this.farmY(s.y), 2, flip);
      if (s.shearedNow) { ctx.font = '12px sans-serif'; ctx.fillText('✂️', this.farmX(s.x) + 10, this.farmY(s.y) - 4); }
      if (s.golden && s.kind !== 'shorn') {
        ctx.font = '11px sans-serif';
        ctx.fillText('✨', this.farmX(s.x) + 26, this.farmY(s.y) - 4 + Math.sin(s.walkT) * 2);
      }
    }
  }

  // ── ③⑤作業場・工房（左右2部屋・素材と成果物を大きく） ──
  private drawWorkshop(
    lTitle: string, lDark: string, lColor: string,
    rTitle: string, rDark: string, rColor: string,
  ): void {
    const { ctx } = this;
    const isWork = this.scene === 'work';
    const room = (x0: number, color: string, dark: string, title: string) => {
      ctx.fillStyle = dark; ctx.fillRect(x0, 0, CW / 2, CH);
      ctx.fillStyle = color; ctx.fillRect(x0 + 6, 26, CW / 2 - 12, CH - 60);
      ctx.fillStyle = '#2a2418'; ctx.fillRect(x0 + 6, CH - 34, CW / 2 - 12, 28); // 床
      ctx.fillStyle = '#f4efe3'; ctx.font = '10px DotGothic16, monospace';
      ctx.fillText(title, x0 + 12, 16);
    };
    room(0, lColor, lDark, lTitle);
    room(CW / 2, rColor, rDark, rTitle);
    ctx.fillStyle = '#0d1030'; ctx.fillRect(CW / 2 - 2, 0, 4, CH);

    if (!this.overlay) return;
    const o = this.overlay;
    const pile = (x: number, y: number, spr: Sprite, n: number, scale = 2) => {
      if (n <= 0) return;
      const show = Math.min(3, n);
      for (let i = 0; i < show; i++) drawSprite(ctx, spr, x + i * 10, y - i * 5, scale);
      ctx.fillStyle = '#fff'; ctx.font = '10px DotGothic16, monospace';
      ctx.fillText(`x${n}`, x + show * 10 + 10, y + 16);
    };
    if (isWork) {
      // ウール社：羊毛→糸
      pile(24, 150, WOOLBAG, o.woolWool);
      pile(96, 90, YARNROLL, o.woolYarn);
      // ミート社：羊→ラム肉
      if (o.meatSheep > 0) {
        for (let i = 0; i < Math.min(3, o.meatSheep); i++) drawSprite(ctx, LAMB, 184 + i * 14, 146 - i * 5, 2);
        ctx.fillStyle = '#fff'; ctx.fillText(`x${o.meatSheep}`, 226, 166);
      }
      pile(256, 90, MEATBOX, o.meatMeat);
      ctx.fillStyle = '#ffd24a'; ctx.font = '9px DotGothic16, monospace';
      ctx.fillText('タップで紡績→', 24, 196);
      ctx.fillText('タップでと畜→', 184, 196);
    } else {
      // アパレル：糸→服
      pile(24, 150, YARNROLL, o.apparelYarn);
      pile(96, 90, goodsSprite('muffler'), o.apparelGoods);
      // デリカ：肉→加工品
      pile(184, 150, MEATBOX, o.delicaMeat);
      pile(256, 90, goodsSprite('genghis'), o.delicaGoods);
      ctx.fillStyle = '#ffd24a'; ctx.font = '9px DotGothic16, monospace';
      ctx.fillText('レシピは下から', 24, 196);
      ctx.fillText('レシピは下から', 184, 196);
    }
  }

  // ── ⑦店先 ──
  private drawMarket(): void {
    const { ctx } = this;
    ctx.fillStyle = '#2a2418'; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#a97b4b'; ctx.fillRect(0, 0, CW, 44);
    ctx.fillStyle = '#8a5a33';
    for (let x = 0; x < CW; x += 40) ctx.fillRect(x, 0, 20, 44);
    ctx.fillStyle = '#f4efe3'; ctx.font = '12px DotGothic16, monospace';
    ctx.fillText('🏪 メェコノミー直売所', 88, 28);
    // 棚2段
    for (const y of [110, 180]) {
      ctx.fillStyle = '#6b4a26'; ctx.fillRect(16, y, CW - 32, 10);
    }
    const n = Math.max(0, (this.overlay?.salesBoxes ?? 0) - Math.round(this.marketT >= 0 ? this.marketBought : 0));
    let placed = 0;
    for (const y of [86, 156]) {
      for (let i = 0; i < 9 && placed < n; i++, placed++) {
        drawSprite(ctx, placed % 3 === 2 ? goodsSprite('genghis') : goodsSprite('muffler'), 24 + i * 32, y, 2);
      }
    }
    ctx.fillStyle = '#fff'; ctx.font = '10px DotGothic16, monospace';
    ctx.fillText(`店頭在庫 x${n}`, 116, 226);
    // お客さん
    for (const c of this.customers) {
      if (this.marketT < c.delay) continue;
      drawSprite(ctx, CUSTOMER, c.x, c.y, 2);
    }
  }

  // ── マップ俯瞰 ──
  private drawMap(dt: number): void {
    const { ctx } = this;
    this.skyAndGrass(40, dt);
    ctx.fillStyle = PAL.B!;
    ctx.beginPath(); ctx.ellipse(272, 38, 40, 12, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(234, 38, 78, 4);

    ctx.fillStyle = '#8a5a33';
    for (let x = PEN.x; x <= PEN.x + PEN.w; x += 16) ctx.fillRect(x, PEN.y - 4, 3, 14);
    ctx.fillRect(PEN.x, PEN.y - 2, PEN.w, 3); ctx.fillRect(PEN.x, PEN.y + 5, PEN.w, 3);
    ctx.fillStyle = '#f4efe3'; ctx.font = '8px DotGothic16, monospace';
    ctx.fillText('🐑ファーム', PEN.x + 2, PEN.y - 8);

    for (const y of [WOOL_ROAD_Y, MEAT_ROAD_Y]) {
      ctx.fillStyle = '#5c6270'; ctx.fillRect(0, y - 16, CW, 18);
      ctx.fillStyle = '#e8e4d8';
      for (let x = 0; x < CW; x += 24) ctx.fillRect(x, y - 8, 10, 2);
    }

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
      ctx.fillStyle = '#a97b4b'; ctx.fillRect(302, WOOL_ROAD_Y - 44, 16, MEAT_ROAD_Y - WOOL_ROAD_Y + 28);
      ctx.fillStyle = '#f4efe3';
      ctx.fillText('市', 306, WOOL_ROAD_Y - 30); ctx.fillText('場', 306, WOOL_ROAD_Y - 18);
      ctx.fillStyle = '#6b7280'; ctx.fillRect(DEPOT.x, DEPOT.y, DEPOT.w, DEPOT.h);
      ctx.fillStyle = '#4b5563'; ctx.fillRect(DEPOT.x, DEPOT.y - 5, DEPOT.w, 5);
      ctx.fillStyle = '#f4efe3';
      ctx.fillText(`🚚のこり${this.trucksLeft}`, DEPOT.x + 2, DEPOT.y + 10);
      for (let i = 0; i < Math.min(this.trucksLeft, 4); i++) {
        drawSprite(ctx, TRUCK, DEPOT.x + (i % 2) * 20 - 2, DEPOT.y + 12 + Math.floor(i / 2) * 9, 0.7);
      }
    }

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

    const sorted = [...this.sheep].sort((a, b) => a.y - b.y);
    for (const s of sorted) {
      const f = Math.floor(s.walkT) % 2 === 0;
      const flip = s.dir < 0;
      const spr: Sprite = s.kind === 'baby' ? LAMB : s.kind === 'wool' ? (f ? SHEEP_A : SHEEP_B) : (f ? SHORN_A : SHORN_B);
      drawSprite(this.ctx, spr, s.x, s.y, 1, flip);
      if (s.shearedNow) { ctx.font = '8px sans-serif'; ctx.fillText('✂️', s.x + 4, s.y - 2); }
      if (s.golden && s.kind !== 'shorn') { ctx.font = '8px sans-serif'; ctx.fillText('✨', s.x + 12, s.y - 2); }
    }

    for (const tr of this.transports) {
      const geo = ROUTE_GEO[tr.route];
      const x = geo.from + (geo.to - geo.from) * Math.min(1, tr.t);
      const y = (geo.lane === 'wool' ? WOOL_ROAD_Y : MEAT_ROAD_Y) - 15;
      drawSprite(ctx, TRUCK, x, y, 1);
      if (tr.goods) drawSprite(ctx, goodsSprite(tr.goods), x + 3, y - 7, 1);
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
