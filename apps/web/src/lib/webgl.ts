/** Small WebGL 1 helpers shared by the landing's particle scenes. */

/** Reads a `--token` stored as "r g b" channels into a 0..1 vec3. */
export function readToken(
  name: string,
  fallback: [number, number, number]
): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return fallback;
  return [parts[0]! / 255, parts[1]! / 255, parts[2]! / 255];
}

export function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (process.env.NODE_ENV !== 'production') console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
