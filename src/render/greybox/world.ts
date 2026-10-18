/**
 * The world's things in greybox (memory/world.md, memory/greybox.md): moon patches (a pale shaft of
 * moonlight on the ground, brighter while she stands in it, a ring the moment she rests), glades (a
 * pillar of pale light, gone dim once taken; the grant flashes; its line is the HUD's item line), shortcuts (amber while shut, with a white bar on the side that opens them; an outline once
 * open) and doors (a green arch). Read from the scene, the save and the sim events; draws nothing that
 * moves the sim.
 */
import { type Container, Graphics, type Text } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import { GB } from './palette';
import { label } from './static';

interface Flash {
  kind: 'rest' | 'grant' | 'open';
  x: number;
  y: number;
  t: number;
  life: number;
  text: Text | null;
}

export class WorldView {
  private readonly flashes: Flash[] = [];
  /** Under her: patches, glades, shortcuts, doors. */
  readonly back = new Graphics();
  /** Over her: the flashes. */
  readonly front = new Graphics();

  /** The moon patch's first-time cue ("be still to rest"), shown while she stands in a patch not yet rested. */
  private hint: Text | null = null;

  constructor(private readonly texts: Container) {}

  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'patchRest') this.add('rest', e.x, e.y - 100, 0.9, 'rested · saved');
      // (The grant's line is the HUD's item line, hud/item-line.ts: in screen space, never cut off.)
      else if (e.type === 'gladeGrant') this.add('grant', e.x, e.y - 260, 5, '');
      else if (e.type === 'shortcutOpen') this.add('open', e.x, e.y, 0.8, 'opened');
      else if (e.type === 'spawn' && events.some((o) => o.type === 'roomEnter')) this.clear();
    }
  }

  private add(kind: Flash['kind'], x: number, y: number, life: number, text: string): void {
    const t = text ? label(text, x, y, GB.label, 20) : null;
    if (t) this.texts.addChild(t);
    this.flashes.push({ kind, x, y, t: 0, life, text: t });
  }

  private clear(): void {
    for (const f of this.flashes) f.text?.destroy();
    this.flashes.length = 0;
  }

  draw(dt: number, clock: number, sim: SimView): void {
    const scene = sim.scene;
    const save = sim.save;
    const g = this.back.clear();
    const P = tuning.patch;
    let hintAt: { x: number; y: number } | null = null;
    (scene.patches ?? []).forEach((pt, i) => {
      const here = sim.rest.at === i;
      const mine = save.patch?.room === scene.id && save.patch.id === pt.id;
      const a = here ? 0.32 : 0.16;
      // A shaft of moonlight: brighter toward the ground.
      for (let k = 0; k < 6; k++) {
        const h = P.height * (1 + k * 0.6);
        g.rect(pt.x - P.width / 2 + k * 6, pt.y - h, P.width - k * 12, h).fill({
          color: 0xd8e6ff,
          alpha: a / 6,
        });
      }
      g.rect(pt.x - P.width / 2, pt.y - 4, P.width, 4).fill({ color: 0xd8e6ff, alpha: mine ? 0.95 : 0.6 });
      if (mine) g.circle(pt.x, pt.y - P.height - 30, 9).fill({ color: 0xd8e6ff, alpha: 0.9 });
      else g.circle(pt.x, pt.y - P.height - 30, 9).stroke({ color: 0xd8e6ff, width: 2, alpha: 0.6 });
      // Standing in it, not yet rested this stay (first-timer r3 rested by accident): the moon over it fills
      // as she keeps still, and until her first rest ever a quiet line says how.
      if (here && !sim.rest.done) {
        const k = Math.min(1, sim.rest.frames / Math.max(1, P.restFrames));
        const cy = pt.y - P.height - 30;
        const pulse = 0.5 + 0.5 * Math.sin(clock * 3);
        g.circle(pt.x, cy, 16 + 4 * pulse).stroke({ color: 0xd8e6ff, width: 2, alpha: 0.25 + 0.2 * pulse });
        if (k > 0)
          g.moveTo(pt.x + 16, cy)
            .arc(pt.x, cy, 16, 0, k * Math.PI * 2)
            .stroke({ color: 0xd8e6ff, width: 3, alpha: 0.9 });
        hintAt = save.patch === null ? { x: pt.x, y: cy - 40 } : null;
      }
    });
    if (!this.hint) {
      this.hint = label('be still to rest', 0, 0, 0xd8e6ff, 15);
      this.texts.addChild(this.hint);
    }
    // (Set inside the forEach above: TS cannot see that.)
    const at = hintAt as { x: number; y: number } | null;
    this.hint.visible = at !== null;
    if (at) {
      this.hint.position.set(Math.round(at.x), Math.round(at.y));
      // (Subtle: Matt's play, 2026-10-18, the world stops pointing at everything; this one a person does need once.)
      this.hint.alpha = 0.35;
    }
    for (const gl of scene.glades ?? []) {
      const taken = save.taken.includes(`${scene.id}:${gl.id}`);
      const pulse = taken ? 0 : 0.5 + 0.5 * Math.sin(clock * 2.2);
      g.rect(gl.x, gl.y - 600, gl.w, gl.h + 600).fill({
        color: 0xffffff,
        alpha: taken ? 0.03 : 0.07 + 0.05 * pulse,
      });
      g.rect(gl.x + gl.w * 0.3, gl.y - 600, gl.w * 0.4, gl.h + 600).fill({
        color: 0xffffff,
        alpha: taken ? 0.03 : 0.1,
      });
      g.rect(gl.x, gl.y, gl.w, gl.h).stroke({ color: 0xffffff, width: 2, alpha: taken ? 0.2 : 0.7 });
    }
    for (const sc of scene.shortcuts ?? []) {
      const open = save.opened.includes(`${scene.id}:${sc.id}`);
      if (open) {
        g.rect(sc.x, sc.y, sc.w, sc.h).stroke({ color: 0xffb347, width: 2, alpha: 0.35 });
        continue;
      }
      g.rect(sc.x, sc.y, sc.w, sc.h).fill({ color: 0x8a6a3a });
      const horiz = sc.opens === 'n' || sc.opens === 's';
      const bx = sc.opens === 'e' ? sc.x + sc.w - 6 : sc.x;
      const by = sc.opens === 's' ? sc.y + sc.h - 6 : sc.y;
      g.rect(horiz ? sc.x : bx, horiz ? by : sc.y, horiz ? sc.w : 6, horiz ? 6 : sc.h).fill({
        color: 0xfff0c0,
      });
    }
    const D = tuning.room;
    for (const d of scene.doors ?? []) {
      const w = D.doorWidth;
      const h = D.doorHeight;
      g.moveTo(d.x - w / 2, d.y)
        .lineTo(d.x - w / 2, d.y - h + w / 2)
        .arc(d.x, d.y - h + w / 2, w / 2, Math.PI, 0)
        .lineTo(d.x + w / 2, d.y)
        .stroke({ color: GB.exit, width: 3, alpha: 0.9 });
    }
    // Flashes over her.
    const f = this.front.clear();
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i] as Flash;
      fl.t += dt;
      const k = Math.min(1, fl.t / fl.life);
      if (fl.kind === 'rest')
        f.circle(fl.x, fl.y + 60, 40 + 160 * k).stroke({ color: 0xd8e6ff, width: 3, alpha: 1 - k });
      else if (fl.kind === 'grant') {
        const burst = Math.min(1, fl.t / 0.6);
        f.circle(fl.x, fl.y + 200, 60 + 400 * burst).stroke({ color: 0xffffff, width: 4, alpha: 1 - burst });
      } else f.circle(fl.x, fl.y, 30 + 120 * k).stroke({ color: 0xffb347, width: 3, alpha: 1 - k });
      if (fl.text) {
        fl.text.alpha = k < 0.75 ? 1 : (1 - k) / 0.25;
        if (fl.kind === 'grant') fl.text.position.set(sim.player.cx, sim.player.feetY - 160);
      }
      if (fl.t >= fl.life) {
        fl.text?.destroy();
        this.flashes.splice(i, 1);
      }
    }
  }
}
