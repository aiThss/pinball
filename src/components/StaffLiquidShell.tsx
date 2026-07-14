"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import styles from "./StaffLiquidShell.module.css";
import roundedStyles from "./StaffRoundedCards.module.css";
import quickStyles from "./StaffQuickActions.module.css";
import darkStyles from "./StaffDarkContrast.module.css";
import identityStyles from "./StaffIdentityBanner.module.css";
import paginationStyles from "./StaffRecordPagination.module.css";

type StaffTheme = "light" | "dark";
type PageItem = number | "ellipsis-left" | "ellipsis-right";

const themeStorageKey = "pinball_staff_theme";
const staffNameStorageKey = "pinball_staff_name";
const recordsPerPage = 6;

function getInitialTheme(): StaffTheme {
  if (typeof window === "undefined") return "light";

  try {
    const saved = window.localStorage.getItem(themeStorageKey);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Fall back to the system preference when storage is unavailable.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncDocumentTheme(theme: StaffTheme) {
  const color = theme === "dark" ? "#07080a" : "#eef0f4";
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", color);
  });
  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = theme;
  document.body.style.backgroundColor = color;
}

function getPageItems(totalPages: number, currentPage: number): PageItem[] {
  if (totalPages <= 6) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis-right", totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [
      1,
      "ellipsis-left",
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "ellipsis-left",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis-right",
    totalPages,
  ];
}

export default function StaffLiquidShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<StaffTheme>("light");
  const [quickActionsMount, setQuickActionsMount] = useState<HTMLElement | null>(null);
  const [paginationMount, setPaginationMount] = useState<HTMLElement | null>(null);
  const [recordPage, setRecordPage] = useState(1);
  const [recordPageCount, setRecordPageCount] = useState(0);
  const [showGateFooter, setShowGateFooter] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const recordsSectionRef = useRef<HTMLElement | null>(null);

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
    if (!shell) return;

    let mount: HTMLDivElement | null = null;
    const ensureMount = () => {
      if (mount?.isConnected) return;
      const contentSection = shell.querySelector<HTMLElement>("main > div > section");
      if (!contentSection) return;
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

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const updateGateState = () => {
      const gate = shell.querySelector("main > section");
      const dashboardHeader = shell.querySelector("main > header");
      setShowGateFooter(Boolean(gate && !dashboardHeader));
    };

    updateGateState();
    const observer = new MutationObserver(updateGateState);
    observer.observe(shell, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    let mount: HTMLDivElement | null = null;
    let frame = 0;

    const updatePagination = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const table = [...shell.querySelectorAll<HTMLTableElement>("table")].find((candidate) => {
          const text = candidate.textContent ?? "";
          return text.includes("Gửi/Lấy thẻ") && text.includes("Trạng thái");
        });
        const section = table?.closest<HTMLElement>("section");
        if (!table || !section) {
          setRecordPageCount(0);
          return;
        }

        recordsSectionRef.current = section;
        const articles = [...section.querySelectorAll<HTMLElement>("article")].filter(
          (article) => article.closest("section") === section,
        );
        const rows = [...table.querySelectorAll<HTMLTableRowElement>("tbody > tr")].filter(
          (row) => !(row.textContent ?? "").includes("Không có bản ghi"),
        );
        const totalRecords = Math.max(articles.length, rows.length);
        const totalPages = Math.max(1, Math.ceil(totalRecords / recordsPerPage));
        const safePage = Math.min(recordPage, totalPages);

        if (safePage !== recordPage) {
          setRecordPage(safePage);
          return;
        }

        setRecordPageCount(totalRecords > 0 ? totalPages : 0);
        const start = (safePage - 1) * recordsPerPage;
        const end = start + recordsPerPage;
        articles.forEach((article, index) => {
          article.hidden = index < start || index >= end;
        });
        rows.forEach((row, index) => {
          row.hidden = index < start || index >= end;
        });

        const loadMoreButton = [...section.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
          /Tải thêm|Đang tải/.test(button.textContent ?? ""),
        );
        if (loadMoreButton) {
          let container: HTMLElement | null = loadMoreButton.parentElement;
          while (container?.parentElement && container.parentElement !== section) {
            container = container.parentElement;
          }
          if (container) container.hidden = true;
        }

        if (totalRecords === 0 || totalPages <= 1) {
          mount?.remove();
          mount = null;
          setPaginationMount(null);
          return;
        }

        if (!mount?.isConnected) {
          mount = document.createElement("div");
          mount.className = paginationStyles.paginationMount;
          section.append(mount);
          setPaginationMount(mount);
        }
      });
    };

    updatePagination();
    const observer = new MutationObserver(updatePagination);
    observer.observe(shell, { childList: true, subtree: true, characterData: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      mount?.remove();
    };
  }, [recordPage]);

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

  function changeRecordPage(page: number) {
    setRecordPage(Math.max(1, Math.min(page, recordPageCount)));
    window.requestAnimationFrame(() => {
      recordsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const quickActions = quickActionsMount
    ? createPortal(
        <nav className={quickStyles.quickActionsCard} aria-label="Cài đặt nhanh nhân viên">
          <a className={`${quickStyles.quickAction} ${quickStyles.downloadAction}`} href="/install">
            <Download aria-hidden="true" />
            <span>Tải xuống</span>
          </a>
          <button type="button" className={`${quickStyles.quickAction} ${quickStyles.themeAction}`} onClick={toggleTheme}>
            {theme === "light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            <span>{theme === "light" ? "Light mode" : "Dark mode"}</span>
          </button>
          <button type="button" className={`${quickStyles.quickAction} ${quickStyles.renameAction}`} onClick={resetStaffName}>
            <LogOut aria-hidden="true" />
            <span>Nhập lại tên</span>
          </button>
        </nav>,
        quickActionsMount,
      )
    : null;

  const pagination = paginationMount && recordPageCount > 1
    ? createPortal(
        <nav className={paginationStyles.pagination} aria-label="Phân trang bản ghi">
          <button
            type="button"
            className={paginationStyles.pageButton}
            onClick={() => changeRecordPage(recordPage - 1)}
            disabled={recordPage === 1}
            aria-label="Trang trước"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <div className={paginationStyles.pageNumbers}>
            {getPageItems(recordPageCount, recordPage).map((item) =>
              typeof item === "number" ? (
                <button
                  key={item}
                  type="button"
                  className={`${paginationStyles.pageButton}${item === recordPage ? ` ${paginationStyles.currentPage}` : ""}`}
                  onClick={() => changeRecordPage(item)}
                  aria-current={item === recordPage ? "page" : undefined}
                >
                  {item}
                </button>
              ) : (
                <span className={paginationStyles.ellipsis} key={item} aria-hidden="true">…</span>
              ),
            )}
          </div>
          <button
            type="button"
            className={paginationStyles.pageButton}
            onClick={() => changeRecordPage(recordPage + 1)}
            disabled={recordPage === recordPageCount}
            aria-label="Trang sau"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>,
        paginationMount,
      )
    : null;

  return (
    <div
      ref={shellRef}
      className={`${styles.shell} ${roundedStyles.roundedShell} ${quickStyles.quickActionsShell} ${darkStyles.darkContrastShell} ${identityStyles.identityBannerShell} ${paginationStyles.paginationShell}`}
      data-staff-theme={theme}
    >
      <div className={styles.backdrop} aria-hidden="true" />
      {quickActions}
      {pagination}
      <div className={styles.content}>{children}</div>
      <footer
        className={`${paginationStyles.siteFooter} ${
          showGateFooter ? paginationStyles.gateFooter : paginationStyles.dashboardFooter
        }`}
      >
        <div className={paginationStyles.gateBrand}>
          <span>© 2026 • Made by</span>
          <span className={paginationStyles.copyrightSignature}>aiThs</span>
        </div>
        <div className={paginationStyles.gateContactLabel}>Contact for work</div>
        <ChevronDown className={paginationStyles.gateArrow} aria-hidden="true" />
        <a className={paginationStyles.gateEmail} href="mailto:danhthai4560@gmail.com">
          danhthai4560@gmail.com
        </a>
      </footer>
    </div>
  );
}
