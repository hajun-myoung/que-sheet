import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "큐 · 발표가 흐르는 곳",
  description: "발표 자료 제출부터 현장 진행과 심사까지, 한곳에서.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
