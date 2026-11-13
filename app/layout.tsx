import type { Metadata } from "next";
import "./globals.css";

const title = "큐:시트 · 매끄러운 발표에 집중할 수 있도록.";
const description =
  "자료 제출부터 발표 연습, 현장 진행과 심사까지, 큐:시트가 도와드립니다.";
const shareImage = {
  url: "/cuesheet-og.png",
  width: 1200,
  height: 630,
  alt: "큐:시트 — 매끄러운 발표에 집중할 수 있도록. 자료 제출 · 발표 연습 · 현장 진행 · 심사",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://que-sheet.vercel.app"),
  title,
  description,
  applicationName: "큐:시트",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "큐:시트",
    url: "/",
    title,
    description,
    images: [{ ...shareImage, type: "image/png" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [shareImage],
  },
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
