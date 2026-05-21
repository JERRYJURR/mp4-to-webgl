export const VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG_HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform float u_time;
uniform float u_duration;
uniform vec2 u_resolution;
uniform float u_loop_phase;
uniform vec2 u_loop_coord;

out vec4 fragColor;
`;

const FRAG_FOOTER = /* glsl */ `
void main() {
  vec4 outCol = vec4(0.0);
  mainImage(outCol, gl_FragCoord.xy);
  fragColor = vec4(clamp(outCol.rgb, 0.0, 1.0), 1.0);
}
`;

export interface AssembledShader {
  vertex: string;
  fragment: string;
}

export function assembleShader(generatedBody: string): AssembledShader {
  const trimmed = stripFences(generatedBody).trim();
  const wantsRawMain = /void\s+main\s*\(/.test(trimmed);
  if (wantsRawMain) {
    return {
      vertex: VERTEX_SHADER,
      fragment: `${FRAG_HEADER}\n${trimmed}\n`,
    };
  }
  let body = trimmed;
  if (!/mainImage\s*\(/.test(body)) {
    body = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n${body}\n}`;
  }
  return {
    vertex: VERTEX_SHADER,
    fragment: `${FRAG_HEADER}\n${body}\n${FRAG_FOOTER}`,
  };
}

function stripFences(s: string): string {
  let out = s;
  out = out.replace(/```glsl\s*/gi, "");
  out = out.replace(/```\s*$/g, "");
  out = out.replace(/^```\s*/g, "");
  return out;
}

export function shadertoyExample(): string {
  return /* glsl */ `vec2 uv = fragCoord / u_resolution.xy;
uv = uv * 2.0 - 1.0;
uv.x *= u_resolution.x / u_resolution.y;

float ang = 6.2831853 * u_loop_phase;
mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
vec2 p = rot * uv;

float r = length(p);
float a = atan(p.y, p.x);
float bands = 0.5 + 0.5 * sin(a * 4.0 + r * 6.0 + 6.2831853 * u_loop_phase);

vec3 col = mix(vec3(0.10, 0.04, 0.20), vec3(0.55, 0.30, 0.95), bands);
col += 0.15 * smoothstep(0.9, 0.0, r);
fragColor = vec4(col, 1.0);`;
}
