/**
 * The boss rush's hub (br-hub, memory/bossrush.md): over each boss's door a moon-mark says where the run stands:
 * dark while its silk is shut, a cold silver ring that breathes once the way is open, a warm full disc once that
 * boss has fallen. One to three pips under each give the order. Render only (reads the save's flags).
 */
import type { Graphics } from 'pixi.js';
import type { SimView } from '../contract';
import type { GlowPool } from '../lantern/glow';

/** The hub's doors in order: the door, the flag that opens it ('' = always), the flag its boss sets. */
export const HUB_DOORS: ReadonlyArray<{ door: string; opens: string; down: string }> = [
  { door: 'to-weaver', opens: '', down: 'br-weaver-down' },
  { door: 'to-gloam', opens: 'br-weaver-down', down: 'br-gloam-down' },
  { door: 'to-mantis', opens: 'br-gloam-down', down: 'br-mantis-down' },
];

const COLD = 0xd4e4ff;
const WARM = 0xffc070;

export function drawHub(sim: SimView, clock: number, g: Graphics, glow: GlowPool): void {
  if (sim.scene.id !== 'br-hub') return;
  const doors = (sim.scene as { doors?: Array<{ id: string; x: number; y: number }> }).doors ?? [];
  const flags = sim.save.flags;
  HUB_DOORS.forEach((h, i) => {
    const d = doors.find((q) => q.id === h.door);
    if (!d) return;
    const x = d.x;
    const y = d.y - 230;
    const open = h.opens === '' || flags.includes(h.opens);
    const down = flags.includes(h.down);
    const breathe = 0.5 + 0.5 * Math.sin(clock * 2 + i);
    if (down) {
      g.circle(x, y, 20).fill({ color: WARM, alpha: 0.95 });
      glow.add(x, y, 90, WARM, 0.35);
    } else if (open) {
      g.moveTo(x + 20, y);
      g.circle(x, y, 20);
      g.stroke({ color: COLD, width: 3, alpha: 0.6 + 0.35 * breathe });
      glow.add(x, y, 70 + 20 * breathe, COLD, 0.2 + 0.15 * breathe);
    } else {
      g.moveTo(x + 20, y);
      g.circle(x, y, 20);
      g.stroke({ color: 0x5a6070, width: 2, alpha: 0.5 });
    }
    for (let k = 0; k <= i; k++)
      g.circle(x + (k - i / 2) * 14, y + 36, 3.5).fill({
        color: down ? WARM : open ? COLD : 0x5a6070,
        alpha: 0.85,
      });
  });
}
