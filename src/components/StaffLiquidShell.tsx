"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, LogOut, Moon, Sun } from "lucide-react";
import styles from "./StaffLiquidShell.module.css";
import roundedStyles from "./StaffRoundedCards.module.css";
import quickStyles from "./StaffQuickActions.module.css";
import darkStyles from "./StaffDarkContrast.module.css";
import identityStyles from "./StaffIdentityBanner.module.css";

type StaffTheme = "light" | "dark";

const themeStorageKey = "pinball_staff_theme";
const staffNameStorageKey = "pinball_staff_name";

function getInitialTheme(): StaffTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const saved = window.localStorage.getItem(themeStorageKey);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // Fall back to the system preference when storage is unavailable.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncDocumentTheme(theme: StaffTheme) {
  const color = theme === "dark" ? "#07080a" : "#eef0f4";
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((meta) => meta.setAttribute("content", color));

  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = theme;
  document.body.style.backgroundColor = color;
}

export default function StaffLiquidShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<StaffTheme>("light");
  const [quickActionsMount, setQuickActionsMount] = useState<HTMLElement | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialTheme = getInitialTheme();
    const timer = window.setTimeout(() => {
      setTheme(initialTheme);
      syncDocumentTheme(initialTheme);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.documentElement.style.removeProperty("background-color");
      document.documentElement.style.removeProperty("color-scheme");
      document.body.style.removeProperty("background-color");
    };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    let mount: HTMLDivElement | null = null;

    const ensureMount = () => {
      if (mount?.isConnected) {
        return;
      }

      // Staff dashboard: main > grid wrapper > content section.
      // The name-entry gate has no matching structure, so the actions only appear after login.
      const contentSection = shell.querySelector<HTMLElement>("main > div > section");
      if (!contentSection) {
        return;
      }

      mount = document.createElement("div");
      mount.className = quickStyles.quickActionsMount;
      contentSection.prepend(mount);
      setQuickActionsMount(mount);
    };

    ensureMount();

    const observer = new MutationObserver(ensureMount);
    observer.observe(shell, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mount?.remove();
    };
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";

      try {
        window.localStorage.setItem(themeStorageKey, next);
      } catch {
        // Keep the current session theme usable even if storage is blocked.
      }

      syncDocumentTheme(next);
      return next;
    });
  }

  function resetStaffName() {
    try {
      window.localStorage.removeItem(staffNameStorageKey);
    } catch {
      // Reloading still resets the current React session if storage is unavailable.
    }

    window.location.reload();
  }

  const quickActions = quickActionsMount
    ? createPortal(
        <nav className={quickStyles.quickActionsCard} aria-label="Cài đặt nhanh nhân viên">
          <a className={`${quickStyles.quickAction} ${quickStyles.downloadAction}`} href="/install">
            <Download aria-hidden="true" />
            <span>Tải xuống</span>
          </a>

          <button
            type="button"
            className={`${quickStyles.quickAction} ${quickStyles.themeAction}`}
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Chuyển sang Dark mode" : "Chuyển sang Light mode"}
          >
            {theme === "light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            <span>{theme === "light" ? "Light mode" : "Dark mode"}</span>
          </button>

          <button
            type="button"
            className={`${quickStyles.quickAction} ${quickStyles.renameAction}`}
            onClick={resetStaffName}
          >
            <LogOut aria-hidden="true" />
            <span>Nhập lại tên</span>
          </button>
        </nav>,
        quickActionsMount,
      )
    : null;

  return (
    <div
      ref={shellRef}
      className={`${styles.shell} ${roundedStyles.roundedShell} ${quickStyles.quickActionsShell} ${darkStyles.darkContrastShell} ${identityStyles.identityBannerShell}`}
      data-staff-theme={theme}
    >
      <div className={styles.backdrop} aria-hidden="true" />
      {quickActions}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
