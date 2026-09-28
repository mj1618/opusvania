import { BODY } from './look';
import { add, ik, rot, scale, sub, upDir, type V2, v } from './math';
import type { Pose } from './pose';

/** Body centre the whole rig spins about (flips, lying down), rig space. */
export const PIVOT_Y = -40;

/** Rig space -> world: squash about the feet, spin about the body centre, mirror, translate. */
export interface Xf {
  x: number;
  y: number;
  facing: number;
  sx: number;
  sy: number;
  spin: number;
  drop: number;
}

export function toWorld(xf: Xf, p: V2): V2 {
  let x = p.x * xf.sx;
  let y = p.y * xf.sy;
  if (xf.spin !== 0) {
    const py = PIVOT_Y * xf.sy;
    const r = rot({ x, y: y - py }, xf.spin);
    x = r.x;
    y = r.y + py;
  }
  return { x: xf.x + xf.facing * x, y: xf.y + y + xf.drop };
}

/** A direction (no translation) from rig space to world. */
export function dirToWorld(xf: Xf, d: V2): V2 {
  const r = xf.spin !== 0 ? rot(d, xf.spin) : d;
  return { x: xf.facing * r.x, y: r.y };
}

/** Solved joints in rig space. */
export interface Joints {
  hip: V2;
  neck: V2;
  head: V2;
  /** Head angle (lean + tilt) and torso axes. */
  headAng: number;
  up: V2;
  fwd: V2;
  shF: V2;
  elF: V2;
  haF: V2;
  shB: V2;
  elB: V2;
  haB: V2;
  hipF: V2;
  knF: V2;
  anF: V2;
  hipB: V2;
  knB: V2;
  anB: V2;
}

export function solve(pose: Pose): Joints {
  const up = upDir(pose.lean);
  const fwd = { x: -up.y, y: up.x };
  const hip = pose.hip;
  const neck = add(hip, scale(up, BODY.torso));
  const headAng = pose.lean + pose.head;
  const head = add(neck, scale(upDir(headAng * 0.9), BODY.neck));
  const sh = add(hip, scale(up, BODY.shoulderAt));
  const shF = add(sh, scale(fwd, 2.5));
  const shB = add(sh, scale(fwd, -2));
  const armF = ik(
    shF,
    pose.handF,
    BODY.upperArm * pose.reachF,
    BODY.foreArm * pose.reachF,
    pose.elbowF >= 0 ? 1 : -1,
  );
  const armB = ik(
    shB,
    pose.handB,
    BODY.upperArm * pose.reachB,
    BODY.foreArm * pose.reachB,
    pose.elbowB >= 0 ? 1 : -1,
  );
  const hipF = add(hip, scale(fwd, 2.5));
  const hipB = add(hip, scale(fwd, -2.5));
  // Knees bend forward (-1 in ik's convention for a limb pointing down).
  const legF = ik(hipF, pose.footF, BODY.thigh, BODY.shin, -1);
  const legB = ik(hipB, pose.footB, BODY.thigh, BODY.shin, -1);
  return {
    hip,
    neck,
    head,
    headAng,
    up,
    fwd,
    shF,
    elF: armF.joint,
    haF: armF.end,
    shB,
    elB: armB.joint,
    haB: armB.end,
    hipF,
    knF: legF.joint,
    anF: legF.end,
    hipB,
    knB: legB.joint,
    anB: legB.end,
  };
}

/** A point on the head in head-local coords (x forward, y down, rotated with the head). */
export function onHead(j: Joints, p: V2): V2 {
  return add(j.head, rot(p, j.headAng * 0.9));
}

/** Torso-local point: `a` along the torso axis from the hip, `b` forward. */
export function onTorso(j: Joints, a: number, b: number): V2 {
  return add(j.hip, add(scale(j.up, a), scale(j.fwd, b)));
}

export function unit(a: V2, b: V2): V2 {
  const d = sub(b, a);
  const l = Math.hypot(d.x, d.y) || 1;
  return v(d.x / l, d.y / l);
}
