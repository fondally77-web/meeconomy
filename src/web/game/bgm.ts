/** BGM：WebAudio合成のチップチューンループ（外部ファイルなし）
 *  2曲：'title'＝オープニング（ゆったり牧歌）／'main'＝本編（アップテンポ）
 */
import { unlockAudio } from './se.js';

export type Track = 'title' | 'main';

let playing = false;
let timer: ReturnType<typeof setInterval> | null = null;
let nextBarTime = 0;
let barIndex = 0;
let master: GainNode | null = null;
let track: Track = 'main';

const BPM_OF: Record<Track, number> = { title: 96, main: 150 };
let BEAT = 60 / BPM_OF.main;    // 4分音符（曲で変わる）
let BAR = BEAT * 4;

// 音名→周波数
const N: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, Bb3: 233.08, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
};

// 8小節ループ（C - G - Am - F ×2、8分音符ではずむ）。[拍位置, 音, 長さ(拍)]
type Note = [number, string, number];
const MELODY: Note[][] = [
  [[0, 'C5', 0.5], [0.5, 'G4', 0.5], [1, 'E5', 0.5], [1.5, 'C5', 0.5], [2, 'G4', 0.5], [2.5, 'C5', 0.5], [3, 'E5', 1]],
  [[0, 'D5', 0.5], [0.5, 'B4', 0.5], [1, 'G4', 0.5], [1.5, 'B4', 0.5], [2, 'D5', 1], [3, 'G5', 1]],
  [[0, 'E5', 0.5], [0.5, 'C5', 0.5], [1, 'A4', 0.5], [1.5, 'C5', 0.5], [2, 'E5', 0.5], [2.5, 'C5', 0.5], [3, 'A4', 1]],
  [[0, 'F4', 0.5], [0.5, 'A4', 0.5], [1, 'C5', 0.5], [1.5, 'A4', 0.5], [2, 'F5', 1], [3, 'E5', 0.5], [3.5, 'D5', 0.5]],
  [[0, 'G4', 0.5], [0.5, 'E4', 0.5], [1, 'G4', 0.5], [1.5, 'C5', 0.5], [2, 'E5', 0.5], [2.5, 'D5', 0.5], [3, 'C5', 1]],
  [[0, 'B4', 0.5], [0.5, 'G4', 0.5], [1, 'D5', 0.5], [1.5, 'B4', 0.5], [2, 'G5', 1], [3, 'D5', 1]],
  [[0, 'A4', 0.5], [0.5, 'C5', 0.5], [1, 'E5', 0.5], [1.5, 'C5', 0.5], [2, 'A5', 0.5], [2.5, 'G5', 0.5], [3, 'E5', 1]],
  [[0, 'F5', 0.5], [0.5, 'D5', 0.5], [1, 'C5', 0.5], [1.5, 'B4', 0.5], [2, 'D5', 0.5], [2.5, 'B4', 0.5], [3, 'G4', 1]],
];
// ベース：4分でルートと5度を刻む
const BASS: string[][] = [
  ['C3', 'G3', 'C3', 'G3'], ['G3', 'D3', 'G3', 'D3'], ['A3', 'E3', 'A3', 'E3'], ['F3', 'C3', 'F3', 'C3'],
  ['C3', 'G3', 'C3', 'G3'], ['G3', 'D3', 'G3', 'B3'], ['A3', 'E3', 'A3', 'E3'], ['F3', 'C3', 'G3', 'G3'],
];

/** オープニング曲：ゆったり4小節（F - C - Dm - B♭）。夜明けの牧場のイメージ */
const TITLE_MELODY: Note[][] = [
  [[0, 'F4', 1.5], [1.5, 'A4', 0.5], [2, 'C5', 1.5], [3.5, 'A4', 0.5]],
  [[0, 'G4', 1], [1, 'E4', 1], [2, 'G4', 1.5], [3.5, 'C5', 0.5]],
  [[0, 'A4', 1.5], [1.5, 'F4', 0.5], [2, 'D5', 1.5], [3.5, 'C5', 0.5]],
  [[0, 'A4', 1], [1, 'G4', 1], [2, 'F4', 2]],
];
const TITLE_BASS: string[][] = [
  ['F3', 'C3'], ['C3', 'G3'], ['D3', 'A3'], ['Bb3', 'F3'],
];

function ensureMaster(ac: AudioContext): GainNode {
  if (!master) {
    master = ac.createGain();
    master.gain.value = 0.045;
    master.connect(ac.destination);
  }
  return master;
}

function voice(ac: AudioContext, out: GainNode, freq: number, at: number, dur: number, type: OscillatorType, vol: number): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.02);
  g.gain.setValueAtTime(vol, at + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function scheduleBar(ac: AudioContext, out: GainNode, bar: number, at: number): void {
  if (track === 'title') {
    // オープニング：メロディは三角波でやわらかく、ベースは2分音符、打楽器なし
    const m = bar % 4;
    for (const [beat, note, len] of TITLE_MELODY[m]) {
      voice(ac, out, N[note], at + beat * BEAT, len * BEAT * 0.9, 'triangle', 0.85);
      voice(ac, out, N[note] * 2, at + beat * BEAT, len * BEAT * 0.9, 'sine', 0.3);  // 1オクターブ上を薄く重ねる
    }
    TITLE_BASS[m].forEach((note, i) => {
      voice(ac, out, N[note], at + i * BEAT * 2, BEAT * 1.8, 'sine', 1.1);
    });
    return;
  }
  const m = bar % 8;
  for (const [beat, note, len] of MELODY[m]) {
    voice(ac, out, N[note], at + beat * BEAT, len * BEAT * 0.85, 'square', 0.45);
  }
  BASS[m].forEach((note, i) => {
    voice(ac, out, N[note], at + i * BEAT, BEAT * 0.8, 'triangle', 0.95);
  });
  // 8分のハット（裏拍アクセント）
  for (let i = 0; i < 8; i++) {
    voice(ac, out, i % 2 === 1 ? 4200 : 3200, at + i * BEAT * 0.5, 0.025, 'square', i % 2 === 1 ? 0.07 : 0.045);
  }
}

let wanted = true;   // ユーザーがOFFにしたら以後の自動再開もしない

export function isBgmOn(): boolean { return playing; }

export function startBgmIfWanted(t: Track = 'main'): void {
  if (wanted) startBgm(t);
}

export function startBgm(t: Track = 'main'): void {
  if (playing && t === track) return;
  if (playing) stopBgm();          // 曲を切り替えるときは一度止める
  track = t;
  BEAT = 60 / BPM_OF[t];
  BAR = BEAT * 4;
  const ac = unlockAudio();
  const out = ensureMaster(ac);
  playing = true;
  nextBarTime = ac.currentTime + 0.1;
  barIndex = 0;
  timer = setInterval(() => {
    if (!playing) return;
    // 0.5秒先までのバーを予約
    while (nextBarTime < ac.currentTime + 0.6) {
      scheduleBar(ac, out, barIndex, nextBarTime);
      nextBarTime += BAR;
      barIndex++;
    }
  }, 200);
}

export function stopBgm(): void {
  playing = false;
  if (timer) { clearInterval(timer); timer = null; }
  // 予約済みノートは減衰が早いので自然に消えるのを待つ
}

export function toggleBgm(): boolean {
  if (playing) { stopBgm(); wanted = false; }
  else { startBgm(track); wanted = true; }
  return playing;
}
