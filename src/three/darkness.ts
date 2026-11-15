import * as THREE from "three";

/**
 * Darkness the cheap way: every lit material multiplies its colour by the same light mask the
 * 2D game uses (core lightAt: 1 - d / r around each campfire), plus a faint moonlight floor.
 * One shader patch, no real-time lights or shadow maps, so it costs almost nothing on phones.
 */
export const MAX_FIRES = 3;

export const darknessUniforms = {
  uFires: { value: Array.from({ length: MAX_FIRES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uNight: { value: new THREE.Color(0.045, 0.05, 0.085) },
  uWarm: { value: new THREE.Color(1.25, 0.95, 0.68) },
  uPlayer: { value: new THREE.Vector3(0, 0, 0) },
};

/** Set fire i (x, z in metres, radius in metres, intensity 0..1). */
export function setFire(i: number, x: number, z: number, r: number, k: number): void {
  darknessUniforms.uFires.value[i]!.set(x, z, r, k);
}

const VERT_DECL = "varying vec3 vAbcWorld;\n";
const VERT_BODY = `
  vec4 abcP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    abcP = instanceMatrix * abcP;
  #endif
  vAbcWorld = (modelMatrix * abcP).xyz;
`;
const FRAG_DECL = `
varying vec3 vAbcWorld;
uniform vec4 uFires[${MAX_FIRES}];
uniform vec3 uNight;
uniform vec3 uWarm;
uniform vec3 uPlayer;
float abcLight(vec2 p) {
  float best = 0.0;
  for (int i = 0; i < ${MAX_FIRES}; i++) {
    vec4 f = uFires[i];
    if (f.z <= 0.0) continue;
    float t = clamp(1.0 - distance(p, f.xy) / f.z, 0.0, 1.0);
    best = max(best, t * f.w);
  }
  return best;
}
`;
const FRAG_BODY = `
  float abcL = abcLight(vAbcWorld.xz);
  // a small personal glow so the player never vanishes completely in the dark
  float abcSelf = 0.18 * clamp(1.0 - distance(vAbcWorld, uPlayer + vec3(0.0, 1.0, 0.0)) / 2.2, 0.0, 1.0);
  outgoingLight *= uNight + uWarm * smoothstep(0.0, 1.0, abcL) * 1.15 + vec3(abcSelf);
  #include <opaque_fragment>
`;

/** Patch a material so the campfire light mask applies to it. */
export function withDarkness<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, darknessUniforms);
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace("#include <opaque_fragment>", FRAG_BODY);
  };
  mat.customProgramCacheKey = () => "abc-dark";
  return mat;
}

export function litMaterial(params: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  return withDarkness(new THREE.MeshLambertMaterial(params));
}
