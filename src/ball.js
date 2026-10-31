import * as THREE from 'three';
import { BALL_R, HALF_L, GOAL_HW, GOAL_H, GOAL_D, POST_R } from './constants.js';
import { ballTexture, contactShadowTexture } from './textures.js';

const GRAVITY = 9.81;
const ROLL_DECEL = 1.9;
const AIR_DRAG = 0.06;
// Lateral acceleration = MAGNUS * (spin x velocity); spin.y = 1 bends a 25 m/s ball ~7.5 m/s^2 to its left.
export const MAGNUS = 0.3;
export const SPIN_DECAY = 0.55;

export class Ball {
  constructor(scene, renderer) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 32, 24),
      new THREE.MeshStandardMaterial({ map: ballTexture(renderer), roughness: 0.35, metalness: 0.05 }),
    );
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.contact = new THREE.Mesh(
      new THREE.PlaneGeometry(BALL_R * 4, BALL_R * 4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.contact.renderOrder = -1;
    scene.add(this.contact);
    this.pos = new THREE.Vector3(0, BALL_R, 0);
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.spinAxis = new THREE.Vector3();
    this.onBounce = null;
    this.onPost = null;
  }

  place(x, z, y = BALL_R) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
  }

  get onGround() {
    return this.pos.y <= BALL_R + 0.02;
  }

  step(dt) {
    const v = this.vel;
    const p = this.pos;
    const w = this.spin;
    const grounded = p.y <= BALL_R + 0.005 && Math.abs(v.y) < 0.6;
    const km = grounded ? MAGNUS * 0.25 : MAGNUS;
    const ax = km * (w.y * v.z - w.z * v.y);
    const ay = km * (w.z * v.x - w.x * v.z);
    const az = km * (w.x * v.y - w.y * v.x);
    v.x += ax * dt;
    v.z += az * dt;
    if (!grounded) v.y += ay * dt;
    w.multiplyScalar(Math.exp(-(grounded ? 2.5 : SPIN_DECAY) * dt));
    if (grounded) {
      v.y = 0;
      p.y = BALL_R;
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0) {
        const ns = Math.max(0, hs - ROLL_DECEL * dt) * Math.exp(-0.18 * dt);
        v.x *= ns / hs;
        v.z *= ns / hs;
      }
    } else {
      v.y -= GRAVITY * dt;
      v.multiplyScalar(Math.exp(-AIR_DRAG * dt));
    }
    p.addScaledVector(v, dt);

    if (p.y < BALL_R) {
      p.y = BALL_R;
      if (v.y < -1.2) {
        if (this.onBounce) this.onBounce(-v.y);
        v.y = -v.y * 0.55;
        v.x *= 0.88;
        v.z *= 0.88;
      } else v.y = 0;
    }

    this.collideFrame(1);
    this.collideFrame(-1);
  }

  collideFrame(s) {
    const p = this.pos;
    const v = this.vel;
    const gx = s * HALF_L;
    const rr = BALL_R + POST_R;
    if (Math.abs(p.x - gx) < 1 && p.y < GOAL_H + rr) {
      for (const zs of [-1, 1]) {
        const pz = zs * (GOAL_HW + POST_R);
        const dx = p.x - gx;
        const dz = p.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < rr && d > 1e-5) {
          const nx = dx / d;
          const nz = dz / d;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= 1.7 * vn * nx;
            v.z -= 1.7 * vn * nz;
            if (this.onPost) this.onPost(-vn);
          }
          p.x = gx + nx * rr;
          p.z = pz + nz * rr;
        }
      }
    }
    if (Math.abs(p.x - gx) < 1 && Math.abs(p.z) < GOAL_HW + POST_R) {
      const dx = p.x - gx;
      const dy = p.y - (GOAL_H + POST_R);
      const d = Math.hypot(dx, dy);
      if (d < rr && d > 1e-5) {
        const nx = dx / d;
        const ny = dy / d;
        const vn = v.x * nx + v.y * ny;
        if (vn < 0) {
          v.x -= 1.7 * vn * nx;
          v.y -= 1.7 * vn * ny;
          if (this.onPost) this.onPost(-vn);
        }
        p.x = gx + nx * rr;
        p.y = GOAL_H + POST_R + ny * rr;
      }
    }
    // Net: ball inside the goal frame gets caught
    if (s * p.x > HALF_L && s * p.x < HALF_L + GOAL_D + 0.5 && Math.abs(p.z) < GOAL_HW && p.y < GOAL_H) {
      const back = s * (HALF_L + GOAL_D - BALL_R);
      if (s * p.x > s * back) {
        p.x = back;
        if (s * v.x > 0) v.x *= -0.15;
        v.z *= 0.5;
        v.y *= 0.5;
      }
      if (Math.abs(p.z) > GOAL_HW - BALL_R) {
        p.z = Math.sign(p.z) * (GOAL_HW - BALL_R);
        v.z *= -0.2;
      }
      if (p.y > GOAL_H - BALL_R) {
        p.y = GOAL_H - BALL_R;
        if (v.y > 0) v.y *= -0.2;
      }
    }
  }

  updateVisual(dt) {
    this.mesh.position.copy(this.pos);
    const lift = Math.max(0, this.pos.y - BALL_R);
    this.contact.position.set(this.pos.x, 0.012, this.pos.z);
    this.contact.scale.setScalar(1 + lift * 0.6);
    this.contact.material.opacity = Math.max(0, 1 - lift * 0.5);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.01) {
      this.spinAxis.set(this.vel.z, 0, -this.vel.x).normalize();
      this.mesh.rotateOnWorldAxis(this.spinAxis, (Math.min(hs, 12) / BALL_R) * dt);
    }
    if (Math.abs(this.spin.y) > 0.02) this.mesh.rotateOnWorldAxis(UP, this.spin.y * 40 * dt);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
