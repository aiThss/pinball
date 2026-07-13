"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import styles from "./StaffLiquidShell.module.css";

type StaffTheme = "light" | "dark";

const storageKey = "pinball_staff_theme";

function getInitialTheme(): StaffTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const saved = window.localStorage.getItem(storageKey);
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

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";

      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Keep the current session theme usable even if storage is blocked.
      }

      syncDocumentTheme(next);
      return next;
    });
  }

  return (
    <div className={styles.shell} data-staff-theme={theme}>
      <div className={styles.backdrop} aria-hidden="true" />

      <button
        type="button"
        className={styles.themeToggle}
        onClick={toggleTheme}
        aria-label={theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng"}
        title={theme === "light" ? "Dark Glass" : "Light Glass"}
      >
        {theme === "light" ? <Moon aria-hidden="true" size={20} /> : <Sun aria-hidden="true" size={20} />}
      </button>

      <div className={styles.content}>{children}</div>
    </div>
  );
}
