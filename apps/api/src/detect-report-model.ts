import type { AcademicPlatform } from "./academic-platforms";

export type DetectHighlightKind = "significant" | "suspected" | "neutral" | "skipped";

export type DetectMetricRecord = {
  label: string;
  value: string;
};

export type DetectFragmentRecord = {
  id: string;
  title: string;
  text: string;
  charCount: number;
  score: number;
  scoreDisplay: string;
  highlight: DetectHighlightKind;
  highlightLabel: string;
  metrics?: DetectMetricRecord[];
};

export type DetectDistributionBucket = {
  label: string;
  rangeLabel: string;
  totalChars: number;
  significantChars: number;
  suspectedChars: number;
  score: number;
  scoreDisplay: string;
};

export type DetectReportModel = {
  platform: AcademicPlatform;
  platformLabel: string;
  reportTitle: string;
  reportSubtitle: string;
  reportNo: string;
  generatedAt: string;
  documentTitle: string;
  author?: string;
  unit?: string;
  fileName?: string;
  scoreLabel: string;
  overallScore: number;
  overallScoreDisplay: string;
  totalChars: number;
  significantChars: number;
  suspectedChars: number;
  significantLabel: string;
  suspectedLabel: string;
  neutralLabel: string;
  metrics: DetectMetricRecord[];
  distribution: DetectDistributionBucket[];
  fragments: DetectFragmentRecord[];
  methodology: string[];
  notes: string[];
  summary?: string;
};
