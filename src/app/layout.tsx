import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import InstallNudge from "@/components/InstallNudge";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, APP_URL, THEME_COLOR } from "@/lib/app-info";
import "./globals.css";

const brittanySignature = localFont({
  src: "../../public/fonts/iCielBrittanySignature-Regular.ttf",
  variable: "--font-brittany-signature",
  display: "swap",
  weight: "400",
  style: "normal",
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: APP_NAME,
  applicationName: APP_NAME,
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    title: APP_SHORT_NAME,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-120.png", sizes: "120x120", type: "image/png" },
      { url: "/icons/apple-touch-icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: THEME_COLOR,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className={`flex min-h-[100dvh] flex-col ${brittanySignature.variable}`}>
        <ServiceWorkerRegistration />
        <InstallNudge />
        {children}
      </body>
    </html>
  );
}
