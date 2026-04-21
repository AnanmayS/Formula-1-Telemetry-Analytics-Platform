export type EventOption = {
  season: number;
  round_number?: number;
  event_name: string;
  country?: string;
  location?: string;
  event_date?: string;
};

export type SessionOption = {
  code: string;
  name: string;
};

export type DriverSummary = {
  abbreviation: string;
  driver_number?: string;
  full_name?: string;
  team_name?: string;
  grid_position?: number;
  finishing_position?: number;
  status?: string;
  q1_time_seconds?: number;
  q2_time_seconds?: number;
  q3_time_seconds?: number;
  qualifying_stage?: string;
};

export type SessionSummary = {
  season: number;
  event: string;
  session: string;
  country?: string;
  circuit_name?: string;
  event_date?: string;
  driver_count: number;
  total_laps: number;
  has_replay: boolean;
  has_weather: boolean;
  weather: Record<string, unknown>[];
  drivers: DriverSummary[];
};

export type LeaderboardRow = {
  lap_number: number;
  position: number;
  driver: string;
  gap_to_leader?: number;
  lap_time_seconds?: number;
  compound?: string;
  stint?: number;
};

export type ReplayCar = {
  driver: string;
  x: number;
  y: number;
  lap?: number;
  progress?: number;
  speed?: number;
  throttle?: number;
  brake?: number;
  rpm?: number;
  gear?: number;
  drs?: number;
  track_status?: string;
  track_status_label?: string;
};

export type TrackStatusSegment = {
  start: number;
  end: number;
  status?: string;
  kind: "normal" | "yellow" | "safety_car" | "vsc" | "red_flag" | string;
  label: string;
  color: string;
};

export type ReplayFrame = {
  time: number;
  lap?: number;
  cars: ReplayCar[];
  leaderboard: LeaderboardRow[];
};

export type ReplayResponse = {
  duration: number;
  track: { x: number; y: number }[];
  frames: ReplayFrame[];
  leaderboard: LeaderboardRow[];
  track_status_segments: TrackStatusSegment[];
  approximation_notes: string[];
};

export type TelemetryPoint = {
  time: number;
  x?: number;
  y?: number;
  speed?: number;
  throttle?: number;
  brake?: number;
  rpm?: number;
  gear?: number;
  drs?: number;
  distance?: number;
  relative_distance?: number;
};

export type TelemetryResponse = {
  driver: string;
  lap: string;
  points: TelemetryPoint[];
  lap_times: { lap: number; lap_time_seconds?: number; compound?: string; stint?: number }[];
  stints: Record<string, unknown>[];
};

export type PredictionCardData = {
  driver: string;
  team?: string;
  starting_position?: number;
  actual_finishing_position?: number;
  predicted_finishing_position?: number;
  predicted_class: number;
  predicted_position_delta: number;
  probability_gain: number;
  confidence: number;
  top_contributing_features: { feature: string; score: number }[];
};

export type FinalGridRow = {
  position: number;
  driver: string;
  team?: string;
  starting_position?: number;
  predicted_position_delta: number;
  confidence: number;
};

export type PredictionResponse = {
  season: number;
  event: string;
  session: string;
  model_version?: string;
  predictions: PredictionCardData[];
  final_grid: FinalGridRow[];
};

export type BootstrapStatus = {
  status: string;
  seasons?: number[];
  session?: string;
  processed?: number;
  cached?: number;
  failed?: number;
  completed_at?: string;
  message?: string;
};

export type ModelMetrics = {
  status?: string;
  model_kind?: string;
  mae?: number;
  rmse?: number;
  r2?: number;
  exact_position_accuracy?: number;
  within_1_accuracy?: number;
  within_2_accuracy?: number;
  accuracy?: number;
  precision_macro?: number;
  recall_macro?: number;
  f1_macro?: number;
  gain_probability_precision?: number;
  gain_probability_recall?: number;
  gain_probability_f1?: number;
  labels?: string[];
  confusion_matrix?: number[][];
  split_explanation?: string;
  rows_tested?: number;
  test_races?: string[];
  message?: string;
};
