'use client';

import { useEffect, useRef } from 'react';

import { compile, readToken } from '@/lib/webgl';

/**
 * WebGL scene: a field of particles laid out as a liquidity surface. Columns
 * snap toward bin centres so the field reads as a 3D bin histogram, a slow swell
 * rolls through it, and the pointer lifts and lights the particles beneath it.
 * A click (or tap) sends a shock ring through the field.
 *
 * Plain WebGL 1 with one draw call, no scene library. Rendering pauses while the
 * canvas is off-screen or the tab is hidden; reduced motion draws a single still frame.
 * Scroll tilts the camera as the field passes through the viewport.
 */

const VERTEX = /* glsl */ `
attribute vec2 aGrid;
attribute float aSeed;

uniform float uTime;
uniform float uAspect;
uniform float uPixel;
uniform float uFocal;
uniform vec2 uMouse;
uniform float uHover;
uniform float uEnergy;
uniform vec2 uTilt;
uniform float uScroll;
uniform vec4 uRipples[4];

varying float vAlpha;
varying float vGlow;

const float BINS = 46.0;
const float WIDTH = 3.4;
const float DEPTH = 2.2;

vec4 project(vec3 p) {
  float cy = cos(uTilt.x), sy = sin(uTilt.x);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  float cx = cos(uTilt.y), sx = sin(uTilt.y);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  p.z -= 3.2;
  p.y -= 0.18 - uScroll * 0.35;
  return vec4(p.x * uFocal / uAspect, p.y * uFocal, 0.0, -p.z);
}

void main() {
  float x = aGrid.x * WIDTH;
  float z = aGrid.y * DEPTH;
  float binWidth = (2.0 * WIDTH) / BINS;
  float binCentre = (floor(x / binWidth) + 0.5) * binWidth;
  x = mix(x, binCentre, 0.62);

  // Bin-shaped envelope (a curve distribution) times a rolling swell.
  float envelope = exp(-pow(binCentre * 0.5, 2.0)) * 0.95 + 0.1;
  float swell = sin(binCentre * 1.7 + uTime * 0.55) * 0.5 + 0.5;
  float ridge = sin(z * 2.4 - uTime * 0.8 + binCentre * 0.6) * 0.06;
  float y = envelope * (0.35 + swell * 0.65) * (0.55 + 0.45 * sin(aGrid.y * 3.14159 + 1.2)) + ridge;
  y *= 0.85 + uEnergy * 0.6;

  vec3 world = vec3(x, y - 0.45, z);
  vec4 clip = project(world);
  vec2 screen = clip.xy / clip.w;
  vec2 aspectFix = vec2(uAspect, 1.0);

  float d = distance(screen * aspectFix, uMouse * aspectFix);
  float lift = exp(-d * d * 9.0) * uHover;

  float shock = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w > 0.0 && age > 0.0 && age < 2.4) {
      float rd = distance(screen * aspectFix, r.xy * aspectFix);
      float ring = exp(-pow((rd - age * 1.1) * 7.0, 2.0));
      shock += ring * r.w * (1.0 - age / 2.4);
    }
  }

  world.y += lift * 0.55 + shock * 0.28;
  clip = project(world);

  float depth = clamp((clip.w - 1.4) / 3.6, 0.0, 1.0);
  float edge = (1.0 - smoothstep(0.72, 1.0, abs(aGrid.x))) * (1.0 - smoothstep(0.55, 1.0, abs(aGrid.y)));
  float twinkle = 0.75 + 0.25 * sin(uTime * 1.6 + aSeed * 40.0);

  vGlow = clamp(lift * 1.4 + shock * 1.2, 0.0, 1.0);
  vAlpha = edge * (1.0 - depth * 0.6) * twinkle * (0.55 + y * 1.1) + vGlow * 0.7;
  gl_Position = clip;
  gl_PointSize = uPixel * (1.6 + vGlow * 2.4) * (3.0 / clip.w);
}
`;

const FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uHot;
varying float vAlpha;
varying float vGlow;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  float soft = 1.0 - smoothstep(0.0, 0.25, r);
  float a = soft * clamp(vAlpha, 0.0, 1.0);
  gl_FragColor = vec4(mix(uColor, uHot, vGlow) * a, a);
}
`;

function buildField(columns: number, rows: number) {
  const grid = new Float32Array(columns * rows * 2);
  const seeds = new Float32Array(columns * rows);
  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      // A little jitter keeps the lattice from moiré-ing at a distance.
      grid[i * 2] = (col / (columns - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.006;
      grid[i * 2 + 1] = (row / (rows - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.01;
      seeds[i] = Math.random();
      i++;
    }
  }
  return { grid, seeds, count: columns * rows };
}

export function LiquidityField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = window.innerWidth < 768;
    const field = small ? buildField(92, 46) : buildField(184, 84);

    const bind = (name: string, data: Float32Array, size: number) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      return buffer;
    };
    const gridBuffer = bind('aGrid', field.grid, 2);
    const seedBuffer = bind('aSeed', field.seeds, 1);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uTime = u('uTime');
    const uAspect = u('uAspect');
    const uPixel = u('uPixel');
    const uFocal = u('uFocal');
    const uMouse = u('uMouse');
    const uHover = u('uHover');
    const uEnergy = u('uEnergy');
    const uTilt = u('uTilt');
    const uScroll = u('uScroll');
    const uRipples = u('uRipples');
    gl.uniform3fv(u('uColor'), readToken('--signal', [0.78, 0.8, 0.83]));
    gl.uniform3fv(u('uHot'), readToken('--metal-hi', [0.97, 0.98, 0.98]));

    gl.enable(gl.BLEND);
    // Premultiplied output, additive: overlapping particles brighten like light.
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);

    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uAspect, width / height);
      gl.uniform1f(uPixel, dpr * (small ? 1.5 : 1.25));
      gl.uniform1f(uFocal, width / height < 1 ? 1.15 : 1.75);
    };
    resize();

    // Pointer state is eased toward its target every frame for a fluid feel.
    const pointer = { x: 0, y: -0.2, tx: 0, ty: -0.2, hover: 0, targetHover: 0, energy: 0 };
    const ripples = new Float32Array(16);
    let rippleSlot = 0;
    let scroll = 0;
    let time = 0;
    let last = performance.now();
    let frame = 0;
    let visible = true;

    const toNdc = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return [
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
      ] as const;
    };

    const onMove = (event: PointerEvent) => {
      const [x, y] = toNdc(event.clientX, event.clientY);
      const dx = x - pointer.tx;
      const dy = y - pointer.ty;
      pointer.energy = Math.min(1, pointer.energy + Math.hypot(dx, dy) * 1.8);
      pointer.tx = x;
      pointer.ty = y;
      pointer.targetHover = y > -1.2 && y < 1.2 ? 1 : 0;
    };
    const onLeave = () => {
      pointer.targetHover = 0;
    };
    const onDown = (event: PointerEvent) => {
      const [x, y] = toNdc(event.clientX, event.clientY);
      if (y < -1 || y > 1) return;
      ripples.set([x, y, time, 1], rippleSlot * 4);
      rippleSlot = (rippleSlot + 1) % 4;
    };
    const onScroll = () => {
      const rect = canvas.getBoundingClientRect();
      const vh = window.innerHeight;
      scroll = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height))) - 0.5;
    };

    const draw = () => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, pointer.x, pointer.y);
      gl.uniform1f(uHover, pointer.hover);
      gl.uniform1f(uEnergy, pointer.energy);
      gl.uniform2f(uTilt, -0.18 + pointer.x * 0.12, 0.42 + pointer.y * 0.05 + scroll * 0.25);
      gl.uniform1f(uScroll, scroll);
      gl.uniform4fv(uRipples, ripples);
      gl.drawArrays(gl.POINTS, 0, field.count);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      const ease = 1 - Math.exp(-dt * 6);
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      pointer.hover += (pointer.targetHover - pointer.hover) * ease;
      pointer.energy *= Math.exp(-dt * 1.6);
      draw();
      frame = visible ? requestAnimationFrame(tick) : 0;
    };

    const start = () => {
      if (frame || reducedMotion) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting) && !document.hidden;
      if (visible) start();
      else stop();
    });
    observer.observe(canvas);
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) start();
      else stop();
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw();
    });
    resizeObserver.observe(canvas);

    if (reducedMotion) {
      time = 4;
      draw();
    } else {
      // Listen on the window so the copy and buttons above the canvas still react.
      window.addEventListener('pointermove', onMove, { passive: true });
      if (!coarse) document.documentElement.addEventListener('pointerleave', onLeave);
      window.addEventListener('pointerdown', onDown, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      onScroll();
      start();
    }

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteBuffer(gridBuffer);
      gl.deleteBuffer(seedBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
