/**
 * The hand-off from the world to the HUD, which is given no camera: the goal renderer (updated
 * just before the HUD each frame) leaves where the hero's body centre is on screen, in the HUD's
 * logical px, so a prompt can stand beside her (prompts.ts). `on` is false in a scene without a
 * goal (clean plates): nothing then follows her.
 */
export const hudLink = {
  on: false,
  /** Her body centre, logical view px, and the camera's zoom. */
  x: 0,
  y: 0,
  zoom: 1,
};
