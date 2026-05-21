export type IterationState =
  | "queued"
  | "analyzing"
  | "generating"
  | "compiling"
  | "capturing"
  | "scoring"
  | "done"
  | "failed"
  | "cancelled";

export type FailureReason =
  | "compile_failed"
  | "runtime_failed"
  | "blank_output"
  | "timeout"
  | null;

export type CameraMotion =
  | "static"
  | "slow_pan"
  | "fast_pan"
  | "handheld"
  | "zoom"
  | "none";

export type MotionSpeed = "static" | "slow" | "medium" | "fast" | "chaotic";

export type LoopStrategy =
  | "seamless_periodic"
  | "ping_pong"
  | "cyclic_noise"
  | "rotating_camera"
  | "pulsing";

export type Direction =
  | "none"
  | "upward"
  | "downward"
  | "left"
  | "right"
  | "inward"
  | "outward"
  | "rotational";

export type PrimaryLayout =
  | "centered"
  | "radial"
  | "horizontal_bands"
  | "vertical_bands"
  | "diagonal"
  | "scattered"
  | "full_frame_texture";

export type Depth = "flat" | "shallow" | "layered" | "tunnel" | "volumetric";

export type Symmetry =
  | "none"
  | "horizontal"
  | "vertical"
  | "radial"
  | "kaleidoscopic";

export type ShaderTechnique =
  | "fbm"
  | "domain_warp"
  | "raymarch"
  | "particles"
  | "voronoi"
  | "reaction_diffusion"
  | "postprocess"
  | "three_scene";

/**
 * Iteration output kind. `fragment` = single-pass GLSL fragment shader body.
 * `three_scene` = JS body that returns a Three.js scene (see
 * lib/three/runtime.ts for the contract). Existing records without this
 * field are treated as "fragment". Derived from `recommended_technique`:
 * any technique except "three_scene" maps to "fragment".
 */
export type IterationKind = "fragment" | "three_scene";

export type Complexity = "simple" | "medium" | "high";

export interface AnalysisSchema {
  subject_matter: string;
  motion: {
    camera: CameraMotion;
    subject: string;
    ambient: string;
  };
  motion_profile: {
    speed: MotionSpeed;
    loop_strategy: LoopStrategy;
    dominant_direction: Direction;
  };
  composition: {
    primary_layout: PrimaryLayout;
    depth: Depth;
    symmetry: Symmetry;
  };
  color_palette: {
    dominant: string[];
    accents: string[];
  };
  texture: string[];
  temporal_events: { t_seconds: number; description: string }[];
  shader_strategy: {
    recommended_technique: ShaderTechnique;
    complexity: Complexity;
    risks: string[];
  };
}

export interface DiagnosisSchema {
  score_delta_explanation: string;
  what_is_wrong: string[];
  suggested_changes: string[];
  request_additional_frames_at: number[];
  /**
   * Whether the next iteration should refine the current approach or abandon
   * it. Optional for backward compat with iterations diagnosed before this
   * field existed; treat absence as "tweak".
   */
  recommended_action?: "tweak" | "pivot";
  /** Required when recommended_action === "pivot". */
  pivot_reason?: string | null;
  /** Required when recommended_action === "pivot". */
  new_strategy?: {
    recommended_technique: ShaderTechnique;
    rationale: string;
  } | null;
}

export interface Scores {
  lpips_distance: number;
  lpips_score: number;
  optical_flow_correlation: number;
  loop_continuity_distance: number;
  loop_continuity_score: number;
  combined: number;
}

export interface ComparisonFrame {
  t: number;
  source: string;
  rendered: string;
}

export interface CompileInfo {
  status: "success" | "failed";
  log: string;
  repair_attempts: number;
}

export interface CaptureInfo {
  viewport: [number, number];
  device_scale_factor: number;
  webgl_version: number;
  timestamps: number[];
}

export interface IterationRecord {
  id: string;
  index: number;
  parent_id: string | null;
  state: IterationState;
  failure_reason: FailureReason;
  /**
   * What kind of code lives in `shader_code`. Optional for backward compat:
   * iterations written before this field existed are GLSL fragment bodies.
   */
  kind?: IterationKind;
  shader_code: string;
  diagnosis: DiagnosisSchema | null;
  /**
   * Distinguishes "diagnosis hasn't run yet" from "diagnosis ran successfully"
   * from "diagnosis ran but failed/malformed-JSON". Omitted on old records;
   * treat absence as "ok" when `diagnosis` is present, "pending" otherwise.
   * The UI exposes a "Regenerate diagnosis" affordance for status === "error".
   */
  diagnosis_status?: "pending" | "ok" | "error";
  /** Set when diagnosis_status === "error" — surfaced for debugging only. */
  diagnosis_error?: string;
  scores: Scores | null;
  prompts: { generation: string; diagnosis: string };
  models: {
    analysis_model: string;
    generation_model: string;
    diagnosis_model: string;
  };
  compile: CompileInfo;
  capture: CaptureInfo;
  comparison_frames: ComparisonFrame[];
  created_at: string;
  completed_at: string | null;
}

export interface VideoMetadata {
  duration: number;
  framerate: number;
  resolution: [number, number];
  rotation: number;
  codec: string;
}

export interface VideoState {
  video_id: string;
  filename: string;
  source_path: string;
  thumbnail_path: string;
  metadata: VideoMetadata;
  analysis: {
    initial: AnalysisSchema | null;
    edited: AnalysisSchema | null;
    frames_used: string[];
  };
  iterations: IterationRecord[];
  best_iteration_id: string | null;
  created_at: string;
}

export interface VideoListItem {
  video_id: string;
  filename: string;
  thumbnail_path: string;
  source_path: string;
  iteration_count: number;
  best_iteration_id: string | null;
  is_sample: boolean;
}
