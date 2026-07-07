import type { Metadata } from "next";
import InstallGuide from "@/components/InstallGuide";
import { APP_NAME } from "@/lib/app-info";

export const metadata: Metadata = {
  title: `Cài app | ${APP_NAME}`,
  description: "Hướng dẫn cài Ký gửi PINBALL như PWA trên iOS, Android và Chrome desktop.",
};

export default function InstallPage() {
  return <InstallGuide />;
}
