/**
 * The character renderer: a switcher over the hero designs ("skins"). Only Vesper is left (the
 * other candidates were removed on 2026-10-17); the switcher stays so a new skin is one directory.
 *
 * Every directory `character/<id>/` whose index.ts exports `skin: SkinDef` is a skin. Pick one with
 * `?char=<id>` in the URL, the number keys 1..9 (in ORDER), or `__game.character('<id>')`. The
 * choice is remembered in localStorage. Switching destroys the old skin and builds the new one;
 * the next update is flagged to the skin as a fresh start by a large position jump at most, so
 * skins must reset their cloth/chains on any big jump (they must anyway, for teleports).
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { HatchState } from '../../sim/state';
import type { PlayerView, RenderContext } from '../contract';
import { Cast } from './cast';
import type { CharacterSkin, SkinDef } from './skin';

const modules = import.meta.glob<{ skin?: SkinDef }>('./*/index.ts', { eager: true });
/** Display order = number-key order. Unknown ids sort after these. */
const ORDER = ['vesper'];
// v2: the owner chose Vesper (2026-10-13); a new key so an older remembered choice does not override the default.
const KEY = 'opusvania.char.v2';

/** The catch fade (seconds): out over a catch's start, in on the return. */
const CATCH_FADE = { out: 0.18, in: 0.35 };

export class CharacterRenderer {
  private fade = 1;
  private fadeTo = 1;
  private outSecs = CATCH_FADE.out;
  private inSecs = CATCH_FADE.in;
  readonly skins: readonly SkinDef[];
  private current: CharacterSkin | null = null;
  private currentId = '';
  /** The hatching branch's cocoons and Tatter (cast.ts): behind and in front of the hero. */
  private readonly cast: Cast;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
  ) {
    this.cast = new Cast(ctx, layer);
    const rank = (id: string): number => {
      const i = ORDER.indexOf(id);
      return i < 0 ? ORDER.length : i;
    };
    this.skins = Object.values(modules)
      .map((m) => m.skin)
      .filter((s): s is SkinDef => !!s)
      .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
    let want: string | null = null;
    if (typeof window !== 'undefined') {
      want = new URLSearchParams(window.location.search).get('char');
      try {
        want ??= window.localStorage.getItem(KEY);
      } catch {
        // storage unavailable: fall through to the default
      }
      window.addEventListener('keydown', this.onKey);
    }
    this.select(want ?? '', false);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number.parseInt(e.key, 10);
    const s = Number.isNaN(n) ? undefined : this.skins[n - 1];
    if (s) this.select(s.id);
  };

  /** Frees the skin and the cast and stops listening (the room is going: render/lifecycle.ts). */
  destroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey);
    clearTimeout(this.labelTimer);
    this.current?.destroy();
    this.current = null;
    this.cast.destroy();
  }

  /** The active skin's id. */
  get id(): string {
    return this.currentId;
  }

  /** Switches skin. Unknown ids fall back to the first skin. Returns the id now active. */
  select(id: string, remember = true): string {
    const def = this.skins.find((s) => s.id === id) ?? this.skins[0];
    if (!def) throw new Error('no character skins found');
    if (def.id === this.currentId) return this.currentId;
    this.current?.destroy();
    this.current = def.create(this.ctx, this.layer);
    this.currentId = def.id;
    // Her cocoon's front stays in front of her.
    this.layer.addChild(this.cast.frontMesh);
    this.announce(def);
    if (remember && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(KEY, def.id);
      } catch {
        // ignore
      }
    }
    return this.currentId;
  }

  /** A short on-screen label: which design this is and which number key selects each. */
  private labelTimer = 0;

  private announce(def: SkinDef): void {
    if (typeof document === 'undefined') return;
    // Not in manual mode: the capture tools boot with ?manual and must get a clean frame.
    if (new URLSearchParams(window.location.search).has('manual')) return;
    // Nothing to choose between with a single skin.
    if (this.skins.length < 2) return;
    let el = document.getElementById('char-label');
    if (!el) {
      el = document.createElement('div');
      el.id = 'char-label';
      el.style.cssText =
        'position:fixed;right:10px;top:6px;font:11px/1.4 ui-monospace,monospace;color:#8890a4;opacity:0.55;pointer-events:none';
      document.body.appendChild(el);
    }
    el.style.transition = 'opacity 1s ease';
    el.style.opacity = '1';
    clearTimeout(this.labelTimer);
    this.labelTimer = window.setTimeout(() => {
      if (el) el.style.opacity = '0';
    }, 2500);
    el.textContent = this.skins
      .map((s, i) => `${i + 1} ${s.id === def.id ? `[${s.name}]` : s.name}`)
      .join(' · ');
  }

  /** `hatch`: the sim's `state.hatch` (absent or null: no hatching); `flags`: the save's story flags. */
  update(
    dt: number,
    clock: number,
    player: PlayerView,
    events: readonly SimEvent[],
    hatch: Readonly<HatchState> | null = null,
    flags: readonly string[] = [],
  ): void {
    this.cast.link(dt, hatch, events);
    // A fall catch or a thorn's hold: she fades out where she is and back in where she is put (plan r3, item 9:
    // the world stays lit, no cut to black).
    for (const e of events) {
      if (e.type === 'fallCatch' || (e.type === 'thornHit' && e.frames > 0)) {
        // Gone by the end of the hold (the sim's frames), so she is never seen jumping to the return.
        this.fadeTo = 0;
        this.outSecs = Math.max(1 / 60, Math.min(CATCH_FADE.out, e.frames / 60));
      } else if (e.type === 'fallReturn') {
        this.fadeTo = 1;
        this.fade = 0;
        // Back in over the sim's own fade-in (no input until then).
        this.inSecs = e.fadeIn > 0 ? e.fadeIn / 60 : CATCH_FADE.in;
      } else if (e.type === 'spawn' && !events.some((o) => o.type === 'fallReturn'))
        this.fade = this.fadeTo = 1;
    }
    const rate = this.fadeTo < this.fade ? dt / this.outSecs : dt / this.inSecs;
    this.fade =
      this.fadeTo < this.fade
        ? Math.max(this.fadeTo, this.fade - rate)
        : Math.min(this.fadeTo, this.fade + rate);
    if (this.current) this.current.fade = this.fade;
    this.current?.update(dt, clock, player, events);
    this.cast.update(dt, clock, hatch, player, events, flags);
  }
}
