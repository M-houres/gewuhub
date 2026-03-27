import type { Metadata } from "next";
import { Manrope, Noto_Sans_SC } from "next/font/google";
import { ClientErrorReporter } from "@/components/client-error-reporter";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-ui",
});

const notoSansSc = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-cjk",
});

export const metadata: Metadata = {
  title: "Gewu（格物）- AI 学术助手",
  description: "面向学生与科研人员的一站式 AI 学术助手平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${manrope.variable} ${notoSansSc.variable}`}>
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
