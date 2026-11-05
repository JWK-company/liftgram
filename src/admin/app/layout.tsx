import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// 요청마다 nonce 가 달라야 CSP 가 맞는다. 정적으로 구워진 페이지에는 nonce 를 넣을 수 없다.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "리프트그램 운영",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
