import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "태양광 발전소 용량 분석",
  description: "위성사진 기반 태양광 발전소 예상 용량 분석",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
