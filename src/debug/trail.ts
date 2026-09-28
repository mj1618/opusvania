import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../game';
import type { EventLog } from './event-log';
import { eventMarker, playerView } from './sim-adapter';

interface Ghost {
  f: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Marker {
  f: number;
  label: string;
  x: number;
  y: number;
}

const MARKER_COLORS: Record<string, number> = {
  J: 0x4cff7a,
  Jc: 0x9dff4c,
  W: 0x4cd2ff,
  '2': 0x4c8cff,
  L: 0xffd23f,
  D: 0xff7a4c,
  d: 0xff7a4c,
  C: 0xff4cf0,
  H: 0xff4c6a,
  P: 0xfff04c,
  X: 0xff2020,
  S: 0x4cd2ff,
};

/**
 * Motion-trail overlay for clips (movement-spec §7.6): the hitbox, a velocity vector, a ghost
 * box every `every` frames for the last `length` frames, and event markers (J jump, Jc coyote
 * jump, W wall jump, 2 double jump, L land, D dash, C corner correction, H head bump, X death).
 * Drawn in world space. Positions come from per-step taps, so it is exact in manual mode.
 */
export class TrailOverlay {
  readonly container = new Container();
  private readonly g = new Graphics();
  private readonly labels = new Container();
  private readonly pool: Text[] = [];
  private ghosts: Ghost[] = [];
  private markers: Marker[] = [];
  private roomVersion = -1;
  visible = false;
  length = 60;
  every = 2;

  constructor(
    private readonly game: Game,
    log: EventLog,
  ) {
    this.container.addChild(this.g, this.labels);
    this.container.visible = false;
    log.onStep(({ f, events }) => {
      if (this.game.roomVersion !== this.roomVersion) this.reset();
      const p = playerView(this.game.state);
      this.ghosts.push({ f, x: p.x, y: p.y, w: p.w, h: p.h });
      for (const { e } of events) {
        const label = eventMarker(e);
        if (!label) continue;
        const raw = e.raw as unknown as Record<string, unknown>;
        const x = typeof raw.x === 'number' ? raw.x : p.x + p.w / 2;
        const y = typeof raw.y === 'number' ? raw.y : p.y + p.h;
        this.markers.push({ f, label, x, y });
      }
      const oldest = f - this.length;
      this.ghosts = this.ghosts.filter((gh) => gh.f > oldest);
      this.markers = this.markers.filter((m) => m.f > oldest);
    });
  }

  reset(): void {
    this.ghosts = [];
    this.markers = [];
    this.roomVersion = this.game.roomVersion;
  }

  toggle(on = !this.visible, opts: { length?: number; every?: number } = {}): boolean {
    this.visible = on;
    this.container.visible = on;
    if (opts.length !== undefined) this.length = opts.length;
    if (opts.every !== undefined) this.every = opts.every;
    return on;
  }

  private label(i: number): Text {
    let t = this.pool[i];
    if (!t) {
      t = new Text({
        text: '',
        style: {
          fontFamily: 'monospace',
          fontSize: 34,
          fontWeight: 'bold',
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 5 },
        },
      });
      t.anchor.set(0.5, 1);
      this.pool.push(t);
      this.labels.addChild(t);
    }
    t.visible = true;
    return t;
  }

  draw(): void {
    if (!this.visible) return;
    if (this.game.roomVersion !== this.roomVersion) this.reset();
    const g = this.g.clear();
    const now = this.game.state.frame;
    // Ghost boxes (older = fainter) and a centre dot path.
    for (const gh of this.ghosts) {
      if ((now - gh.f) % this.every !== 0) continue;
      const age = (now - gh.f) / this.length;
      const a = 0.55 * (1 - age) + 0.08;
      g.rect(gh.x + 0.5, gh.y + 0.5, gh.w - 1, gh.h - 1).stroke({ color: 0x9fb4ff, width: 1.5, alpha: a });
      g.circle(gh.x + gh.w / 2, gh.y + gh.h / 2, 4).fill({ color: 0xffffff, alpha: a + 0.2 });
    }
    // Current hitbox and velocity vector (px/frame × 4 so it reads at clip scale).
    const p = playerView(this.game.state);
    g.rect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1).stroke({
      color: p.grounded ? 0x4cff7a : 0xff4c6a,
      width: 2,
    });
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    g.moveTo(cx, cy)
      .lineTo(cx + p.vx * 4, cy + p.vy * 4)
      .stroke({ color: 0xffd23f, width: 3 });
    // Event markers: a tick at the event point and a letter above it.
    for (const t of this.pool) t.visible = false;
    this.markers.forEach((m, i) => {
      const color = MARKER_COLORS[m.label] ?? 0xffffff;
      g.moveTo(m.x - 8, m.y)
        .lineTo(m.x + 8, m.y)
        .moveTo(m.x, m.y - 8)
        .lineTo(m.x, m.y + 4)
        .stroke({ color, width: 3 });
      const t = this.label(i);
      t.text = `${m.label}${m.f}`;
      t.style.fill = color;
      t.position.set(m.x, m.y - 10 - (i % 2) * 34);
    });
  }
}
