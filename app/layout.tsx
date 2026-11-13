import type { Metadata } from "next";
import "./globals.css";
import Footer from "@/components/footer";
export const metadata: Metadata = {
  title: "큐시트 · 매끄러운 발표와 운영",
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
