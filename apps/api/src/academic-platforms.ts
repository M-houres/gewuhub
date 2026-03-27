export const academicPlatforms = ["cnki", "weipu", "paperpass", "wanfang", "daya"] as const;

export type AcademicPlatform = (typeof academicPlatforms)[number];

export const defaultAcademicPlatform: AcademicPlatform = "cnki";

const academicPlatformLabels: Record<AcademicPlatform, string> = {
  cnki: "知网",
  weipu: "维普",
  paperpass: "PaperPass",
  wanfang: "万方",
  daya: "大雅",
};

const academicPlatformAliases: Record<string, AcademicPlatform> = {
  cnki: "cnki",
  "知网": "cnki",
  "模拟知网": "cnki",
  weipu: "weipu",
  "维普": "weipu",
  "模拟维普": "weipu",
  paperpass: "paperpass",
  "paper pass": "paperpass",
  "paper-pass": "paperpass",
  "格子达": "paperpass",
  turnitin: "paperpass",
  "模拟turnitin": "paperpass",
  wanfang: "wanfang",
  "万方": "wanfang",
  daya: "daya",
  "大雅": "daya",
};

export function normalizeAcademicPlatform(value: string | null | undefined): AcademicPlatform {
  if (!value) return defaultAcademicPlatform;

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  const matched = academicPlatformAliases[normalized] ?? academicPlatformAliases[value.trim()];
  return matched ?? defaultAcademicPlatform;
}

export function getAcademicPlatformLabel(platform: AcademicPlatform) {
  return academicPlatformLabels[platform];
}

export function taskRequiresAcademicPlatform(taskType: string) {
  return taskType === "reduce-repeat" || taskType === "reduce-ai" || taskType === "detect";
}
