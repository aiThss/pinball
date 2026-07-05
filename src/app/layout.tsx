import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ký gửi PINBALL",
  description: "Quản lý gửi giữ bi pinball và thẻ đổi quà cho cửa hàng.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
