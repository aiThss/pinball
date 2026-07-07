"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Apple,
  CheckCircle2,
  ChevronLeft,
  Download,
  MonitorSmartphone,
  Plus,
  Share2,
  Ticket,
} from "lucide-react";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/app-info";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(navigatorWithStandalone.standalone)
  );
}

const iosSteps = [
  "Mở đúng domain bằng Safari trên iPhone hoặc iPad.",
  "Nhấn nút Chia sẻ ở thanh công cụ của Safari.",
  "Chọn Thêm vào Màn hình chính.",
  `Giữ tên ${APP_SHORT_NAME} rồi nhấn Thêm.`,
];

const androidSteps = [
  "Mở đúng domain bằng Chrome trên Android.",
  "Nhấn menu ba chấm ở góc trên.",
  "Chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính.",
  "Nhấn Cài đặt hoặc Thêm để hoàn tất.",
];

const desktopSteps = [
  "Mở đúng domain bằng Chrome trên máy tính.",
  "Nhấn biểu tượng cài đặt ở thanh địa chỉ nếu Chrome hiển thị.",
  "Nếu chưa thấy, mở menu Chrome rồi chọn Cài đặt trang này dưới dạng ứng dụng.",
  "Xác nhận Cài đặt để app xuất hiện như ứng dụng desktop.",
];

export default function InstallGuide() {
  const router = useRouter();
  const [isIOS, setIsIOS] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsIOS(isIOSDevice());

      if (isStandaloneMode()) {
        router.replace("/");
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [router]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setCanPrompt(true);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setCanPrompt(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);

    setInstallPrompt(null);
    setCanPrompt(false);

    if (choice?.outcome === "accepted") {
      setInstalled(true);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#F8FAFC] text-[#0F172A]">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#CBD5E1] bg-white px-3 text-sm font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC]"
            href="/"
          >
            <ChevronLeft aria-hidden="true" size={18} />
            Quay lại
          </Link>
          <div className="flex items-center gap-2 text-sm font-bold">
            <Ticket aria-hidden="true" size={18} />
            {APP_SHORT_NAME}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px] lg:py-8">
        <div className="space-y-5">
          <section className="rounded-lg border border-[#CBD5E1] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Image
                alt={`${APP_NAME} icon`}
                className="h-20 w-20 rounded-[8px] border border-[#E5E7EB]"
                height={80}
                src="/icons/icon-192.png"
                width={80}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase text-[#2563EB]">Cài PWA</p>
                <h1 className="mt-1 text-2xl font-bold tracking-normal sm:text-3xl">
                  Cài {APP_NAME} lên điện thoại hoặc máy tính
                </h1>
                <p className="mt-2 text-sm leading-6 text-[#475569]">
                  Sau khi cài, app mở từ màn hình chính như ứng dụng riêng và dùng logo
                  PINBALL đã chuẩn hóa cho Chrome, Android và iOS.
                </p>
              </div>
            </div>

            {isIOS ? (
              <div className="mt-5 rounded-md border border-[#BAE6FD] bg-[#F0F9FF] px-4 py-3 text-sm font-semibold text-[#075985]">
                iPhone/iPad cần cài bằng Safari để hiện đúng tùy chọn Thêm vào Màn hình chính.
              </div>
            ) : null}

            {installed ? (
              <div className="mt-5 flex items-start gap-3 rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm font-semibold text-[#166534]">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
                App đã được cài. Bạn có thể mở từ màn hình chính hoặc danh sách ứng dụng.
              </div>
            ) : null}

            {!isIOS ? (
              <button
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#111827] px-5 text-sm font-semibold text-white transition hover:bg-[#1F2937] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                disabled={!canPrompt}
                onClick={() => void promptInstall()}
                type="button"
              >
                <Download aria-hidden="true" size={18} />
                {canPrompt ? "Cài app ngay" : "Dùng hướng dẫn bên dưới để cài"}
              </button>
            ) : null}
          </section>

          <GuideSection
            icon={<Apple aria-hidden="true" size={22} />}
            title="iPhone hoặc iPad"
            steps={iosSteps}
            accent="bg-[#111827] text-white"
          />

          <GuideSection
            icon={<MonitorSmartphone aria-hidden="true" size={22} />}
            title="Android Chrome"
            steps={androidSteps}
            accent="bg-[#DC2626] text-white"
          />

          <GuideSection
            icon={<Download aria-hidden="true" size={22} />}
            title="Chrome desktop"
            steps={desktopSteps}
            accent="bg-[#0891B2] text-white"
          />
        </div>

        <aside className="h-fit rounded-lg border border-[#CBD5E1] bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold">Dấu hiệu cài đúng</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[#475569]">
            <li className="flex gap-2">
              <CheckCircle2 aria-hidden="true" className="mt-1 shrink-0 text-[#16A34A]" size={16} />
              Icon ngoài màn hình chính hiển thị logo máy pinball rõ nét.
            </li>
            <li className="flex gap-2">
              <CheckCircle2 aria-hidden="true" className="mt-1 shrink-0 text-[#16A34A]" size={16} />
              Khi mở app, thanh địa chỉ trình duyệt không còn hiện như tab web thường.
            </li>
            <li className="flex gap-2">
              <CheckCircle2 aria-hidden="true" className="mt-1 shrink-0 text-[#16A34A]" size={16} />
              Nếu iOS chưa thấy logo, xóa icon cũ rồi thêm lại bằng Safari.
            </li>
          </ul>
        </aside>
      </section>
    </main>
  );
}

function GuideSection({
  accent,
  icon,
  steps,
  title,
}: {
  accent: string;
  icon: React.ReactNode;
  steps: string[];
  title: string;
}) {
  return (
    <section className="rounded-lg border border-[#CBD5E1] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-md ${accent}`}>
          {icon}
        </div>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li className="flex gap-3 text-sm leading-6 text-[#334155]" key={step}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F1F5F9] text-xs font-bold text-[#0F172A]">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {title === "iPhone hoặc iPad" ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[#475569]">
          <span className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#CBD5E1] px-2">
            <Share2 aria-hidden="true" size={14} />
            Chia sẻ
          </span>
          <span className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#CBD5E1] px-2">
            <Plus aria-hidden="true" size={14} />
            Thêm vào Màn hình chính
          </span>
        </div>
      ) : null}
    </section>
  );
}
