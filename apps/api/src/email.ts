import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";
import { captureApiException } from "./monitoring";

function toPositiveNumber(rawValue: string | number | undefined, fallback: number) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const smtpHost = (process.env.SMTP_HOST || "").trim();
const smtpPort = Math.floor(toPositiveNumber(process.env.SMTP_PORT, 587));
const smtpUser = (process.env.SMTP_USER || "").trim();
const smtpPass = process.env.SMTP_PASS || "";
const smtpSecure =
  typeof process.env.SMTP_SECURE === "string" ? process.env.SMTP_SECURE === "true" : smtpPort === 465;
const smtpRequireAuth = typeof process.env.SMTP_REQUIRE_AUTH === "string" ? process.env.SMTP_REQUIRE_AUTH === "true" : true;
const smtpFromEmail = (process.env.SMTP_FROM_EMAIL || "no-reply@gewu.local").trim();
const smtpFromName = (process.env.SMTP_FROM_NAME || "Gewu").trim();

const hasTransportConfig = Boolean(smtpHost);
const hasAuthConfig = !smtpRequireAuth || (smtpUser && smtpPass);

let transporter: Transporter | null = null;
if (hasTransportConfig) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    ...(smtpRequireAuth
      ? {
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        }
      : {}),
  });
}

export type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type TransactionalEmailResult = {
  ok: boolean;
  provider: "smtp" | "dev-log";
  messageId?: string;
  error?: string;
};

function buildFromField() {
  if (!smtpFromName) return smtpFromEmail;
  return `${smtpFromName} <${smtpFromEmail}>`;
}

function toDevMessageId() {
  return `devmail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getEmailTransportStatus() {
  const configured = hasTransportConfig && hasAuthConfig;
  return {
    configured,
    provider: configured ? "smtp" : "dev-log",
    host: smtpHost || null,
    port: smtpPort,
    fromEmail: smtpFromEmail,
    fromName: smtpFromName || null,
  };
}

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const trimmedTo = input.to.trim().toLowerCase();
  if (!trimmedTo) {
    return {
      ok: false,
      provider: "dev-log",
      error: "empty recipient",
    };
  }

  const transportStatus = getEmailTransportStatus();
  if (!transportStatus.configured || !transporter) {
    const messageId = toDevMessageId();
    // eslint-disable-next-line no-console
    console.log(`[email:dev-log] to=${trimmedTo} subject=${input.subject} messageId=${messageId}`);
    return {
      ok: true,
      provider: "dev-log",
      messageId,
    };
  }

  const message: SendMailOptions = {
    from: buildFromField(),
    to: trimmedTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
  };

  try {
    const info = await transporter.sendMail(message);
    return {
      ok: true,
      provider: "smtp",
      messageId: typeof info.messageId === "string" ? info.messageId : undefined,
    };
  } catch (error) {
    captureApiException(error, {
      tags: {
        scope: "email.send",
        provider: "smtp",
      },
      extras: {
        to: trimmedTo,
        subject: input.subject,
      },
    });
    return {
      ok: false,
      provider: "smtp",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
