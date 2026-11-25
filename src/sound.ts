// Short synthesized interface tones. Nothing is downloaded, and no audio
// context exists until the wearer's first input.
let context: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(frequency: number, start: number, length: number, gain = 0.05, type: OscillatorType = 'sine'): void {
  const ctx = audio();
  if (!ctx) return;
  const at = ctx.currentTime + start;
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(gain, at + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
}

export const sound = {
  page: () => tone(660, 0, 0.09, 0.03, 'triangle'),
  select: () => {
    tone(880, 0, 0.07);
    tone(1320, 0.05, 0.1);
  },
  lock: () => {
    tone(520, 0, 0.12, 0.05, 'triangle');
    tone(780, 0.09, 0.12, 0.05, 'triangle');
    tone(1040, 0.18, 0.22, 0.06, 'triangle');
  },
  back: () => tone(440, 0, 0.1, 0.03, 'triangle'),
  alert: () => {
    tone(1175, 0, 0.16, 0.07);
    tone(1568, 0.16, 0.16, 0.07);
    tone(1175, 0.4, 0.16, 0.07);
    tone(1568, 0.56, 0.3, 0.07);
  },
  arrive: () => {
    tone(784, 0, 0.15, 0.06);
    tone(988, 0.12, 0.15, 0.06);
    tone(1175, 0.24, 0.15, 0.06);
    tone(1568, 0.36, 0.4, 0.06);
  },
};
