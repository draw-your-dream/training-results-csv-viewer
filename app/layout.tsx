import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CSV Viewer",
  description: "上传或浏览服务器 CSV 并带图片预览的工具",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="app-initializing">{children}</body>
    </html>
  );
}
