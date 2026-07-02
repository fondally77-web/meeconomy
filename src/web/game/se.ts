/** 効果音（Web Audio合成・P0デモから移植） */

let AC: AudioContext | null = null;
let seOn = true;

export function setSeOn(on: boolean): void { seOn = on; }
export function isSeOn(): boolean { return seOn; }

/** iOSの音声解錠を兼ねる。ユーザー操作イベント内で呼ぶこと */
export function unlockAudio(): AudioContext {
  if (!AC) AC = new AudioContext();
  if (AC.state === 'suspended') void AC.resume();
  return AC;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.12, slide = 0): void {
  if (!seOn) return;
  const a = unlockAudio();
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur);
}

export const SE = {
  shear(): void { tone(2400, 0.06, 'square', 0.10); setTimeout(() => tone(1800, 0.05, 'square', 0.08), 40); },
  pop(): void { tone(300, 0.12, 'sine', 0.18, +600); },
  mee(): void { tone(660, 0.28, 'triangle', 0.14, -180); },
  coin(): void { tone(988, 0.07, 'square', 0.10); setTimeout(() => tone(1319, 0.12, 'square', 0.10), 70); },
  truck(): void { tone(90, 0.35, 'sawtooth', 0.10, +30); },
  buy(): void { tone(523, 0.08, 'square', 0.10); setTimeout(() => tone(784, 0.10, 'square', 0.10), 80); },
  deny(): void { tone(160, 0.18, 'square', 0.12, -60); },
  decide(): void { tone(880, 0.06, 'square', 0.08); },
  fanfare(): void {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.10), i * 130));
  },
};
