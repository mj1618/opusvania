import { BrushSlash } from './brush';
import { DustSlash } from './dust';
import { RibbonSlash } from './ribbon';
import type { SlashStyle } from './types';

export { drawSmear } from './smear';
export type { CutInfo, SlashFrame, SlashStyle, SlashStyleId } from './types';
export { SLASH_STYLES } from './types';

/** One of each style, in the order of `SLASH_STYLES` (the owner cycles them with Y). */
export function makeSlashStyles(): SlashStyle[] {
  return [new BrushSlash(), new RibbonSlash(), new DustSlash()];
}
