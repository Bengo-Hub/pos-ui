'use client';

/**
 * KDS notification tones. Rather than shipping binary audio assets (which fail offline / bloat
 * the bundle), each tone is synthesized on the fly with the Web Audio API as a short sequence
 * of oscillator notes. Used to "ring a waiter" when the Call-Waiter action fires and to chime
 * when an order is ready. Users pick their preferred tone in Settings → KDS and can test-play it.
 */

export type KDSToneId = 'classic_bell' | 'double_beep' | 'chime' | 'buzzer' | 'ascending';

interface Note {
  freq: number;     // Hz
  start: number;    // seconds from now
  duration: number; // seconds
  type?: OscillatorType;
  gain?: number;    // 0..1
}

export interface KDSTone {
  id: KDSToneId;
  label: string;
  notes: Note[];
}

// A small, pleasant palette of alert tones.
export const KDS_TONES: KDSTone[] = [
  {
    id: 'classic_bell',
    label: 'Classic Bell',
    notes: [
      { freq: 880, start: 0, duration: 0.18, type: 'sine', gain: 0.5 },
      { freq: 1320, start: 0.16, duration: 0.35, type: 'sine', gain: 0.4 },
    ],
  },
  {
    id: 'double_beep',
    label: 'Double Beep',
    notes: [
      { freq: 1000, start: 0, duration: 0.12, type: 'square', gain: 0.3 },
      { freq: 1000, start: 0.2, duration: 0.12, type: 'square', gain: 0.3 },
    ],
  },
  {
    id: 'chime',
    label: 'Chime',
    notes: [
      { freq: 660, start: 0, duration: 0.2, type: 'triangle', gain: 0.4 },
      { freq: 880, start: 0.18, duration: 0.2, type: 'triangle', gain: 0.4 },
      { freq: 1100, start: 0.36, duration: 0.3, type: 'triangle', gain: 0.35 },
    ],
  },
  {
    id: 'buzzer',
    label: 'Buzzer',
    notes: [
      { freq: 320, start: 0, duration: 0.4, type: 'sawtooth', gain: 0.25 },
    ],
  },
  {
    id: 'ascending',
    label: 'Ascending',
    notes: [
      { freq: 523, start: 0, duration: 0.12, type: 'sine', gain: 0.4 },
      { freq: 659, start: 0.12, duration: 0.12, type: 'sine', gain: 0.4 },
      { freq: 784, start: 0.24, duration: 0.12, type: 'sine', gain: 0.4 },
      { freq: 1046, start: 0.36, duration: 0.22, type: 'sine', gain: 0.4 },
    ],
  },
];

export const DEFAULT_KDS_TONE: KDSToneId = 'classic_bell';
const STORAGE_KEY = 'pos.kds.waiterTone';

export function getKDSTone(): KDSToneId {
  if (typeof window === 'undefined') return DEFAULT_KDS_TONE;
  const saved = window.localStorage.getItem(STORAGE_KEY) as KDSToneId | null;
  return saved && KDS_TONES.some((t) => t.id === saved) ? saved : DEFAULT_KDS_TONE;
}

export function setKDSTone(id: KDSToneId): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  // Browsers suspend the context until a user gesture — resume on demand.
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

/** Play a tone by id (defaults to the user's saved preference). Safe no-op when audio is unavailable. */
export function playKDSTone(id: KDSToneId = getKDSTone()): void {
  const ac = ctx();
  if (!ac) return;
  const tone = KDS_TONES.find((t) => t.id === id) ?? KDS_TONES[0];
  const now = ac.currentTime;
  for (const n of tone.notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    const peak = n.gain ?? 0.4;
    // Simple attack/decay envelope to avoid clicks.
    gain.gain.setValueAtTime(0.0001, now + n.start);
    gain.gain.exponentialRampToValueAtTime(peak, now + n.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.duration + 0.02);
  }
}
