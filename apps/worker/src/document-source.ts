import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const documentFetchTimeoutMs = Number(process.env.DOCUMENT_FETCH_TIMEOUT_MS || 15_000);

function normalizeText(value: string | null | undefined) {
  return (value || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

async function fetchWithTimeout(sourceFileUrl: string) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), documentFetchTimeoutMs);

  try {
    const response = await fetch(sourceFileUrl, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Unexpected document fetch status ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function resolveDocumentText(input: {
  sourceFileUrl: string;
  sourceExtension?: string;
  fallbackText?: string;
}) {
  const fallbackText = normalizeText(input.fallbackText);
  const extension = (input.sourceExtension || new URL(input.sourceFileUrl).pathname.split(".").pop() || "").toLowerCase();
  const normalizedExtension = extension.startsWith(".") ? extension : extension ? `.${extension}` : "";

  try {
    if (normalizedExtension === ".txt") {
      const response = await fetchWithTimeout(input.sourceFileUrl);
      return normalizeText(await response.text()) || fallbackText;
    }

    if (normalizedExtension === ".docx") {
      const response = await fetchWithTimeout(input.sourceFileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      return normalizeText(result.value) || fallbackText;
    }

    if (normalizedExtension === ".pdf") {
      const parser = new PDFParse({ url: input.sourceFileUrl });
      try {
        const result = await parser.getText();
        return normalizeText(result.text) || fallbackText;
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    }
  } catch {
    return fallbackText;
  }

  return fallbackText;
}
