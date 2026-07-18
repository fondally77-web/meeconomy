/** PWAアイコン生成：羊のドット絵からPNGを純Node（zlib）で書き出す
 *  使い方: npx tsx scripts/gen-icons.ts
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { SHEEP_A, PAL } from '../src/web/game/sprites.js';

// ── 最小PNGエンコーダ ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 羊アイコンを描く ──
function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
function drawIcon(size: number): Buffer {
  const img = Buffer.alloc(size * size * 4);
  const put = (x: number, y: number, [r, g, b]: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = 255;
  };
  const bgTop = hex('#8ec9e8');
  const bgGrass = hex('#7ec850');
  const horizon = Math.round(size * 0.62);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) put(x, y, y < horizon ? bgTop : bgGrass);
  }
  // 羊（16x12）を中央に
  const spr = SHEEP_A;
  const sw = spr[0].length, sh = spr.length;
  const scale = Math.floor(size * 0.82 / sw);
  const ox = Math.floor((size - sw * scale) / 2);
  const oy = Math.floor((size - sh * scale) / 2);
  for (let r = 0; r < sh; r++) {
    for (let c = 0; c < sw; c++) {
      const col = PAL[spr[r][c]];
      if (!col) continue;
      const rgb = hex(col);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) put(ox + c * scale + dx, oy + r * scale + dy, rgb);
      }
    }
  }
  // 金のコイン（右下）
  const cr = Math.round(size * 0.14);
  const cx = size - cr - Math.round(size * 0.08);
  const cy = size - cr - Math.round(size * 0.08);
  const gold = hex('#ffd24a');
  const goldDark = hex('#d4a017');
  for (let y = -cr; y <= cr; y++) {
    for (let x = -cr; x <= cr; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= cr) put(cx + x, cy + y, d > cr - Math.max(2, size / 48) ? goldDark : gold);
    }
  }
  return png(size, size, img);
}

mkdirSync('public', { recursive: true });
for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'public/apple-touch-icon.png' : `public/icon-${size}.png`;
  writeFileSync(name, drawIcon(size));
  console.log(`wrote ${name}`);
}
writeFileSync('public/favicon.png', drawIcon(64));
console.log('wrote public/favicon.png');
