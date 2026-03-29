import { randomBytes } from "crypto";
import { sendTransactionalEmail } from "./email";

const verifyTokens = new Map<string, { email: string; expires: number }>();

export async function sendVerificationEmail(email: string, baseUrl: string) {
  const token = randomBytes(32).toString("hex");
  const expires = Date.now() + 30 * 60 * 1000; // 30分钟

  verifyTokens.set(token, { email, expires });

  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

  await sendTransactionalEmail({
    to: email,
    subject: "验证您的邮箱",
    text: `点击链接验证邮箱：${verifyUrl}`,
    html: `<p>点击链接验证邮箱：<a href="${verifyUrl}">${verifyUrl}</a></p><p>链接30分钟内有效</p>`,
  });
}

export function verifyEmailToken(token: string): string | null {
  const data = verifyTokens.get(token);
  if (!data || data.expires < Date.now()) {
    verifyTokens.delete(token);
    return null;
  }
  verifyTokens.delete(token);
  return data.email;
}
