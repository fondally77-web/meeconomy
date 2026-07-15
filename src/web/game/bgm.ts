/** BGM：WebAudio合成の牧歌チップチューンループ（外部ファイルなし） */
import { unlockAudio } from './se.js';

let playing = false;
let timer: ReturnType<typeof setInterval> | null = null;
let nextBarTime = 0;
let barIndex = 0;
let master: GainNode | null = null;

const BPM = 112;
const BEAT = 60 / BPM;          // 4分音符
const BAR = BEAT * 4;

// 音名→周波数
const N: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
};

// 8小節ループ（C - Am - F - G ×2）。[拍位置, 音, 長さ(拍)]
type Note = [number, string, number];
const MELODY: Note[][] = [
  [[0, 'E4', 1], [1, 'G4', 0.5], [1.5, 'A4', 0.5], [2, 'G4', 1], [3, 'E4', 1]],
  [[0, 'C4', 1.5], [1.5, 'D4', 0.5], [2, 'E4', 2]],
  [[0, 'A4', 1], [1, 'C5', 0.5], [1.5, 'A4', 0.5], [2, 'G4', 1], [3, 'E4', 1]],
  [[0, 'D4', 1.5], [1.5, 'E4', 0.5], [2, 'D4', 2]],
  [[0, 'E4', 1], [1, 'G4', 0.5], [1.5, 'A4', 0.5], [2, 'B4', 1], [3, 'C5', 1]],
  [[0, 'A4', 1.5], [1.5, 'G4', 0.5], [2, 'E4', 2]],
  [[0, 'F4', 1], [1, 'A4', 1], [2, 'G4', 1], [3, 'D4', 1]],
  [[0, 'C4', 3], [3, 'G3', 1]],
];
const BASS: string[][] = [
  ['C3', 'G3'], ['C3', 'E3'], ['A3', 'E3'], ['A3', 'C3'],
  ['F3', 'C3'], ['F3', 'A3'], ['G3', 'D3'], ['C3', 'G3'],
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
  const m = bar % 8;
  for (const [beat, note, len] of MELODY[m]) {
    voice(ac, out, N[note], at + beat * BEAT, len * BEAT * 0.92, 'square', 0.5);
  }
  const [b1, b2] = BASS[m];
  voice(ac, out, N[b1], at, BEAT * 1.8, 'triangle', 0.9);
  voice(ac, out, N[b2], at + 2 * BEAT, BEAT * 1.8, 'triangle', 0.9);
  // 軽いパルスハット
  for (let i = 0; i < 4; i++) {
    voice(ac, out, 3200 + (i % 2) * 800, at + i * BEAT + BEAT / 2, 0.03, 'square', 0.06);
  }
}

let wanted = true;   // ユーザーがOFFにしたら以後の自動再開もしない

export function isBgmOn(): boolean { return playing; }

export function startBgmIfWanted(): void {
  if (wanted) startBgm();
}

export function startBgm(): void {
  if (playing) return;
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
  else { startBgm(); wanted = true; }
  return playing;
}
