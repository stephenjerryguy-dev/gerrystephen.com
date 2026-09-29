// Procedural ambience: warm surf at the top of the page that turns into cold
// wind as you scroll down. Pure WebAudio (no files); starts on first gesture.

const MASTER_VOLUME = 0.08;

type Graph = {
  ctx: AudioContext;
  master: GainNode;
  beach: GainNode;
  snow: GainNode;
  sources: AudioBufferSourceNode[];
};

function noiseBuffer(ctx: AudioContext, seconds = 2) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    last = last * 0.98 + (Math.random() * 2 - 1) * 0.02;
    data[i] = last * 3.4;
  }
  return buffer;
}

export class Ambience {
  private graph: Graph | null = null;
  private enabled = true;
  private cold = 0;
  private listeners: Array<() => void> = [];

  constructor(private onReady: (running: boolean) => void) {}

  /** Arms the first-gesture listeners; audio can't start without one. */
  arm() {
    const start = () => this.start();
    for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
      window.addEventListener(type, start, { passive: true });
      this.listeners.push(() => window.removeEventListener(type, start));
    }
  }

  private start() {
    if (!this.enabled) return;
    if (!this.graph) {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const noise = noiseBuffer(ctx);
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const layer = (type: BiquadFilterType, frequency: number, q: number, level: number) => {
        const source = ctx.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        const gain = ctx.createGain();
        gain.gain.value = level;
        source.connect(filter).connect(gain).connect(master);
        source.start();
        return { source, gain };
      };
      const beach = layer('lowpass', 720, 0.8, 0.7);
      const snow = layer('highpass', 1600, 0.4, 0);
      this.graph = { ctx, master, beach: beach.gain, snow: snow.gain, sources: [beach.source, snow.source] };
      this.applyCold();
    }
    const { ctx, master } = this.graph;
    void ctx.resume().then(() => {
      master.gain.setTargetAtTime(this.enabled ? MASTER_VOLUME : 0, ctx.currentTime, 0.6);
      this.onReady(ctx.state === 'running');
    });
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!this.graph) return;
    const { ctx, master } = this.graph;
    if (enabled) this.start();
    else master.gain.setTargetAtTime(0, ctx.currentTime, 0.18);
  }

  /** 0 = warm beach at the top of the page, 1 = full snow at the bottom. */
  setColdness(value: number) {
    this.cold = Math.min(1, Math.max(0, value));
    this.applyCold();
  }

  private applyCold() {
    if (!this.graph) return;
    const { ctx, beach, snow } = this.graph;
    beach.gain.setTargetAtTime(Math.max(0, 0.78 - this.cold * 0.84), ctx.currentTime, 0.45);
    snow.gain.setTargetAtTime(Math.max(0, (this.cold - 0.18) / 0.82) * 0.58, ctx.currentTime, 0.55);
  }

  dispose() {
    this.listeners.forEach((off) => off());
    this.listeners = [];
    if (!this.graph) return;
    this.graph.sources.forEach((source) => source.stop());
    void this.graph.ctx.close();
    this.graph = null;
  }
}
