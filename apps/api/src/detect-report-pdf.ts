import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { DetectDistributionBucket, DetectFragmentRecord, DetectReportModel } from "./detect-report-model";

type DrawState = {
  y: number;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  contentWidth: number;
};

const summaryBlue = "#2958ff";
const mutedText = "#667085";
const borderColor = "#d9e0ef";
const significantColor = "#d5312f";
const suspectedColor = "#8b5e34";
const neutralColor = "#bcc5d6";

const candidateFontPaths = [
  process.env.PDF_FONT_PATH,
  path.resolve(process.cwd(), "assets", "fonts", "NotoSansSC-Regular.otf"),
  path.resolve(process.cwd(), "dist", "..", "assets", "fonts", "NotoSansSC-Regular.otf"),
  path.resolve(process.cwd(), "..", "assets", "fonts", "NotoSansSC-Regular.otf"),
  "C:\\Windows\\Fonts\\simhei.ttf",
  "C:\\Windows\\Fonts\\msyh.ttf",
  "C:\\Windows\\Fonts\\msyh.ttc",
  "C:\\Windows\\Fonts\\simsun.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
  "/usr/share/fonts/opentype/noto/NotoSerifCJKsc-Regular.otf",
].filter(Boolean) as string[];

function resolveFontPath() {
  return candidateFontPaths.find((item) => existsSync(item)) ?? null;
}

function applyDefaultFont(doc: PDFKit.PDFDocument) {
  const fontPath = resolveFontPath();
  if (fontPath) {
    doc.registerFont("detect-report-font", fontPath);
    doc.font("detect-report-font");
    return;
  }
  doc.font("Helvetica");
}

function createState(doc: PDFKit.PDFDocument): DrawState {
  const margin = 46;
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  return {
    y: margin,
    pageWidth,
    pageHeight,
    margin,
    contentWidth: pageWidth - margin * 2,
  };
}

function ensureSpace(doc: PDFKit.PDFDocument, state: DrawState, height: number) {
  if (state.y + height <= state.pageHeight - state.margin) {
    return;
  }
  doc.addPage();
  applyDefaultFont(doc);
  state.y = state.margin;
  state.pageWidth = doc.page.width;
  state.pageHeight = doc.page.height;
  state.contentWidth = state.pageWidth - state.margin * 2;
}

function writeText(doc: PDFKit.PDFDocument, state: DrawState, text: string, options?: PDFKit.Mixins.TextOptions) {
  const x = state.margin;
  doc.text(text, x, state.y, {
    width: state.contentWidth,
    ...options,
  });
  state.y = doc.y;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, state: DrawState, title: string) {
  ensureSpace(doc, state, 40);
  doc.fontSize(14).fillColor("#1f2a44").text(title, state.margin, state.y);
  state.y = doc.y + 8;
  doc.moveTo(state.margin, state.y).lineTo(state.margin + state.contentWidth, state.y).strokeColor(borderColor).stroke();
  state.y += 12;
}

function drawHeader(doc: PDFKit.PDFDocument, state: DrawState, report: DetectReportModel) {
  doc.fillColor(mutedText).fontSize(10).text("Gewu Academic AI Detection Service", state.margin, state.y);
  doc.text(report.platformLabel, state.pageWidth - state.margin - 90, state.y, { width: 90, align: "right" });
  state.y += 18;

  doc.fillColor("#0f1728").fontSize(22).text(report.reportTitle, state.margin, state.y);
  state.y = doc.y + 4;
  doc.fillColor(mutedText).fontSize(10).text(report.reportSubtitle, state.margin, state.y);
  state.y = doc.y + 12;

  doc.roundedRect(state.margin, state.y, state.contentWidth, 82, 14).fillAndStroke("#f7f9ff", "#dae2ff");
  doc.fillColor("#0f1728").fontSize(10).text(`NO: ${report.reportNo}`, state.margin + 18, state.y + 16);
  doc.text(`检测时间：${report.generatedAt}`, state.margin + 18, state.y + 32);
  doc.text(`篇名：${report.documentTitle || "-"}`, state.margin + 18, state.y + 48, { width: state.contentWidth - 36 });
  const rightX = state.margin + state.contentWidth * 0.55;
  doc.text(`作者：${report.author || "未提供"}`, rightX, state.y + 16, { width: state.contentWidth * 0.35 });
  doc.text(`单位：${report.unit || "未提供"}`, rightX, state.y + 32, { width: state.contentWidth * 0.35 });
  doc.text(`文件名：${report.fileName || "在线文本检测"}`, rightX, state.y + 48, { width: state.contentWidth * 0.35 });
  state.y += 102;
}

function drawSummary(doc: PDFKit.PDFDocument, state: DrawState, report: DetectReportModel) {
  ensureSpace(doc, state, 170);

  const summaryHeight = 138;
  const leftWidth = 220;
  const rightWidth = state.contentWidth - leftWidth - 18;

  doc.roundedRect(state.margin, state.y, leftWidth, summaryHeight, 16).fillAndStroke("#f4f7ff", "#dce5ff");
  doc.fillColor(summaryBlue).fontSize(11).text("全文检测结果", state.margin + 18, state.y + 18);
  doc.fillColor("#0f1728").fontSize(28).text(report.overallScoreDisplay, state.margin + 18, state.y + 40);
  doc.fillColor(mutedText).fontSize(10).text(report.scoreLabel, state.margin + 18, state.y + 78, { width: leftWidth - 36 });
  if (report.summary) {
    doc.text(report.summary, state.margin + 18, state.y + 96, {
      width: leftWidth - 36,
      lineGap: 2,
    });
  }

  const rightX = state.margin + leftWidth + 18;
  doc.roundedRect(rightX, state.y, rightWidth, summaryHeight, 16).strokeColor(borderColor).stroke();
  const metricRows = [
    [`${report.scoreLabel}：`, report.overallScoreDisplay],
    [`${report.significantLabel}：`, String(report.significantChars)],
    [`${report.suspectedLabel}：`, String(report.suspectedChars)],
    ["总字符数：", String(report.totalChars)],
  ];
  metricRows.forEach(([label, value], index) => {
    const rowY = state.y + 18 + index * 24;
    doc.fillColor(mutedText).fontSize(10).text(label, rightX + 18, rowY);
    doc.fillColor("#111827").fontSize(12).text(value, rightX + 110, rowY);
  });

  const legendY = state.y + 112;
  drawLegendItem(doc, rightX + 18, legendY, significantColor, report.significantLabel);
  drawLegendItem(doc, rightX + 130, legendY, suspectedColor, report.suspectedLabel);
  drawLegendItem(doc, rightX + 244, legendY, neutralColor, report.neutralLabel);

  state.y += summaryHeight + 18;
}

function drawLegendItem(doc: PDFKit.PDFDocument, x: number, y: number, color: string, label: string) {
  doc.roundedRect(x, y + 3, 10, 10, 2).fill(color);
  doc.fillColor(mutedText).fontSize(9).text(label, x + 16, y, { width: 90 });
}

function drawMetrics(doc: PDFKit.PDFDocument, state: DrawState, report: DetectReportModel) {
  drawSectionTitle(doc, state, "核心指标");
  const columns = 2;
  const gap = 16;
  const cardWidth = (state.contentWidth - gap) / columns;
  const cardHeight = 52;

  report.metrics.forEach((metric, index) => {
    if (index % columns === 0) {
      ensureSpace(doc, state, cardHeight + 10);
    }

    const col = index % columns;
    const row = Math.floor(index / columns);
    const rowY = state.y + Math.floor(row / 1) * (cardHeight + 10);
    const x = state.margin + col * (cardWidth + gap);

    if (col === 0 && index > 0 && index % columns === 0) {
      state.y += cardHeight + 10;
    }

    doc.roundedRect(x, state.y, cardWidth, cardHeight, 12).strokeColor(borderColor).stroke();
    doc.fillColor(mutedText).fontSize(10).text(metric.label, x + 14, state.y + 12, { width: cardWidth - 28 });
    doc.fillColor("#101828").fontSize(15).text(metric.value, x + 14, state.y + 28, { width: cardWidth - 28 });

    if (col === columns - 1 || index === report.metrics.length - 1) {
      state.y += cardHeight + 10;
    }
  });

  state.y += 4;
}

function drawDistribution(doc: PDFKit.PDFDocument, state: DrawState, report: DetectReportModel) {
  if (report.distribution.length === 0) return;

  drawSectionTitle(doc, state, "AIGC片段分布图");
  const chartWidth = state.contentWidth - 12;
  const chartX = state.margin + 6;

  report.distribution.forEach((bucket) => {
    ensureSpace(doc, state, 44);
    const barY = state.y + 14;
    doc.fillColor("#1f2937").fontSize(10).text(bucket.label, state.margin, state.y, { width: 90 });
    doc.fillColor(mutedText).text(bucket.rangeLabel, state.margin + 92, state.y, { width: 60 });

    const totalWidth = chartWidth - 220;
    const significantWidth = totalWidth * (bucket.significantChars / Math.max(bucket.totalChars, 1));
    const suspectedWidth = totalWidth * (bucket.suspectedChars / Math.max(bucket.totalChars, 1));
    const neutralWidth = Math.max(0, totalWidth - significantWidth - suspectedWidth);
    const barX = chartX + 160;

    doc.roundedRect(barX, barY, totalWidth, 10, 5).fill("#edf1f7");
    if (significantWidth > 0) doc.roundedRect(barX, barY, significantWidth, 10, 5).fill(significantColor);
    if (suspectedWidth > 0) doc.rect(barX + significantWidth, barY, suspectedWidth, 10).fill(suspectedColor);
    if (neutralWidth > 0) doc.rect(barX + significantWidth + suspectedWidth, barY, neutralWidth, 10).fill(neutralColor);

    doc.fillColor("#111827").fontSize(10).text(bucket.scoreDisplay, barX + totalWidth + 10, state.y, { width: 48, align: "right" });
    state.y += 32;
  });

  state.y += 4;
}

function drawFragments(doc: PDFKit.PDFDocument, state: DrawState, report: DetectReportModel) {
  drawSectionTitle(doc, state, "片段指标列表");
  const fragments = report.fragments.length > 0 ? report.fragments : [];

  if (fragments.length === 0) {
    writeText(doc, state, "未识别到需要列出的高风险片段。", { lineGap: 2 });
    state.y += 6;
    return;
  }

  fragments.forEach((fragment) => {
    ensureSpace(doc, state, 120);
    drawFragmentCard(doc, state, fragment);
    state.y += 12;
  });
}

function drawFragmentCard(doc: PDFKit.PDFDocument, state: DrawState, fragment: DetectFragmentRecord) {
  const boxHeight = 96 + Math.min(84, Math.ceil(fragment.text.length / 46) * 16);
  doc.roundedRect(state.margin, state.y, state.contentWidth, boxHeight, 12).strokeColor(borderColor).stroke();

  doc.fillColor("#111827").fontSize(12).text(fragment.title, state.margin + 16, state.y + 14);
  doc.fillColor(colorForHighlight(fragment.highlight)).fontSize(10).text(fragment.highlightLabel, state.margin + 110, state.y + 16);
  doc.fillColor(mutedText).fontSize(10).text(`字符数：${fragment.charCount}`, state.margin + 200, state.y + 16);
  doc.text(`指标：${fragment.scoreDisplay}`, state.margin + 290, state.y + 16);

  if (fragment.metrics && fragment.metrics.length > 0) {
    const metricsText = fragment.metrics.map((item) => `${item.label}${item.value}`).join("  |  ");
    doc.fillColor(mutedText).fontSize(9).text(metricsText, state.margin + 16, state.y + 36, {
      width: state.contentWidth - 32,
    });
  }

  doc.fillColor("#1f2937").fontSize(10).text(fragment.text, state.margin + 16, state.y + 56, {
    width: state.contentWidth - 32,
    lineGap: 3,
  });

  state.y += boxHeight;
}

function colorForHighlight(highlight: DetectFragmentRecord["highlight"]) {
  if (highlight === "significant") return significantColor;
  if (highlight === "suspected") return suspectedColor;
  return mutedText;
}

function drawMethodology(doc: PDFKit.PDFDocument, state: DrawState, title: string, items: string[]) {
  if (items.length === 0) return;
  drawSectionTitle(doc, state, title);
  items.forEach((item, index) => {
    ensureSpace(doc, state, 26);
    doc.fillColor(summaryBlue).fontSize(10).text(`${index + 1}.`, state.margin, state.y);
    doc.fillColor("#1f2937").fontSize(10).text(item, state.margin + 18, state.y, {
      width: state.contentWidth - 18,
      lineGap: 2,
    });
    state.y = doc.y + 6;
  });
}

export async function createDetectReportPdfBuffer(report: DetectReportModel) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 46,
      info: {
        Title: report.reportTitle,
        Author: "Gewu",
        Subject: `${report.platformLabel} AIGC Detection Report`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    applyDefaultFont(doc);
    const state = createState(doc);

    drawHeader(doc, state, report);
    drawSummary(doc, state, report);
    drawMetrics(doc, state, report);
    drawDistribution(doc, state, report);
    drawFragments(doc, state, report);
    drawMethodology(doc, state, "检测说明", report.methodology);
    drawMethodology(doc, state, "补充说明", report.notes);

    doc.end();
  });
}
