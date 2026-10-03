// Generated from approved, unchanged PNGs by design/sapa-animation-v1/build-playback-data.py.
// Anchors register both feet. Source cells retain fractional dimensions.
export const SAPA_MOTIONS = {
  idle: {
    file: "sapa-idle-blink-sheet.png", loop: true,
    durations: [4000, 220, 50, 70, 50, 220, 1600, 1790],
    anchors: [[219.5, 431.0], [218.02, 431.0], [220.0, 431.0], [220.5, 432.0], [219.36, 430.5], [219.0, 430.5], [219.5, 430.5], [219.5, 430.5]],
  },
  wave: {
    file: "sapa-wave-sheet.png", loop: false,
    durations: [100, 90, 90, 100, 100, 100, 90, 130],
    anchors: [[221.0, 439.0], [220.5, 439.0], [221.5, 439.0], [221.5, 439.0], [221.0, 439.5], [220.5, 439.5], [221.0, 439.5], [220.5, 439.5]],
  },
  curious: {
    file: "sapa-curious-sheet.png", loop: false,
    durations: [100, 90, 90, 100, 90, 90, 90, 150],
    anchors: [[212.0, 430.0], [215.5, 430.0], [222.5, 430.0], [229.5, 430.0], [215.5, 429.5], [216.27, 429.5], [222.0, 429.5], [228.0, 429.5]],
  },
  thinking: {
    file: "sapa-thinking-sheet.png", loop: true,
    durations: [240, 180, 160, 180, 120, 240, 240, 240],
    anchors: [[240.5, 432.0], [216.5, 434.0], [194.0, 433.0], [179.0, 434.0], [241.83, 426.5], [217.0, 426.5], [193.5, 426.5], [182.5, 426.5]],
  },
  success: {
    file: "sapa-success-jump-sheet.png", loop: false,
    durations: [90, 70, 60, 90, 60, 80, 80, 110],
    anchors: [[220.0, 438.0], [224.0, 438.0], [204.5, 398.0], [215.0, 386.0], [215.0, 388.5], [224.5, 418.5], [217.5, 420.5], [224.0, 420.5]],
  },
  error: {
    file: "sapa-helpful-error-sheet.png", loop: false,
    durations: [120, 100, 110, 130, 90, 100, 100, 150],
    anchors: [[235.5, 431.0], [236.0, 430.0], [225.5, 431.0], [225.5, 431.0], [237.0, 428.5], [234.0, 428.5], [217.04, 428.5], [216.74, 428.5]],
  },
} as const;

export type SapaMotion = keyof typeof SAPA_MOTIONS;
export type SapaActivityPhase = "idle" | "thinking" | "success" | "error";
export type SapaActivity = { id: number; phase: SapaActivityPhase };
