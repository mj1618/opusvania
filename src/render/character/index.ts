/**
 * The character renderer: a switcher over the candidate hero designs ("skins").
 *
 * Every directory `character/<id>/` whose index.ts exports `skin: SkinDef` is a skin. Pick one with
 * `?char=<id>` in the URL, the number keys 1..9 (in ORDER), or `__game.character('<id>')`. The
 * choice is remembered in localStorage. Switching destroys the old skin and builds the new one;
 * the next update is flagged to the skin as a fresh start by a large position jump at most, so
 * skins must reset their cloth/chains on any big jump (they must anyway, for teleports).
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { PlayerView, RenderContext } from '../contract';
import type { CharacterSkin, SkinDef } from './skin';

const modules = import.meta.glob<{ skin?: SkinDef }>('./*/index.ts', { eager: true });
/** Display order = number-key order. Unknown ids sort after these. */
const ORDER = ['wick', 'yako', 'vesper', 'hooded'];
const KEY = 'opusvania.char';

export class CharacterRenderer {
  readonly skins: readonly SkinDef[];
  private current: CharacterSkin | null = null;
  private currentId = '';

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
  ) {
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
      window.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const n = Number.parseInt(e.key, 10);
        const s = Number.isNaN(n) ? undefined : this.skins[n - 1];
        if (s) this.select(s.id);
      });
    }
    this.select(want ?? '', false);
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
    if (remember && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(KEY, def.id);
      } catch {
        // ignore
      }
    }
    return this.currentId;
  }

  update(dt: number, clock: number, player: PlayerView, events: readonly SimEvent[]): void {
    this.current?.update(dt, clock, player, events);
  }
}
