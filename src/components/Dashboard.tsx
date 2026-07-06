"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Cell, Sheet, SheetData } from "write-excel-file/browser";
import {
  CalendarDays,
  Clock3,
  Coins,
  Eye,
  FileDown,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Search,
  Ticket,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { formatDate, getHanoiNow, getHanoiParts } from "@/lib/time";

type Mode = "staff" | "admin";
type Status = "Đang gửi" | "Đã nhận lại" | "Đã đổi quà" | "Đã hủy";
type CardAction = "Gửi thẻ" | "Lấy thẻ";

type HistoryEntry = {
  id: string;
  at: string;
  actorName: string;
  action: string;
  content: string;
};

type Deposit = {
  id: string;
  fullName: string;
  phone: string;
  depositDate: string;
  depositTime: string;
  cardAction: CardAction;
  cards: number;
  balls: number;
  totalText: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  createdBy: { displayName: string } | null;
  updatedBy: { displayName: string } | null;
  createdByName?: string;
  updatedByName?: string;
  history: HistoryEntry[];
};

type Notice = {
  type: "success" | "error";
  text: string;
};

type DepositFilters = {
  name: string;
  phone: string;
  date: string;
  status: string;
};

type DepositListResponse = {
  deposits: Deposit[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

type DepositSummary = {
  activeDeposits: number;
  totalCards: number;
  totalBalls: number;
  todayDeposits: number;
  historyEntries: number;
};

type DepositSuggestion = {
  phone: string;
  fullName: string;
  activeDeposits: number;
  totalCards: number;
  totalBalls: number;
  latestStatus: Status;
  latestDepositDate: string;
};

type DepositLookup = {
  found: boolean;
  phone: string;
  fullName: string;
  activeDeposits: number;
  totalCards: number;
  totalBalls: number;
  suggestions: DepositSuggestion[];
};

const statuses: Status[] = ["Đang gửi", "Đã nhận lại", "Đã đổi quà", "Đã hủy"];
const cardActions: CardAction[] = ["Gửi thẻ", "Lấy thẻ"];
const staffStorageKey = "pinball_staff_name";
const appTitle = "Ký gửi PINBALL";
const adminDisplayName = "Danh Thai";
const emptyFilters: DepositFilters = {
  name: "",
  phone: "",
  date: "",
  status: "",
};
const emptySummary: DepositSummary = {
  activeDeposits: 0,
  totalCards: 0,
  totalBalls: 0,
  todayDeposits: 0,
  historyEntries: 0,
};
const depositPageLimit = 100;
const exportPageLimit = 300;
const minPhoneSuggestionDigits = 3;

function getDefaultDepositForm(includeDateTime = false) {
  const now = getHanoiNow();

  return {
    fullName: "",
    phone: "",
    cardAction: "Gửi thẻ" as CardAction,
    cards: "0",
    balls: "0",
    depositDate: includeDateTime ? now.date : "",
    depositTime: includeDateTime ? now.time : "",
  };
}

const inputClass =
  "h-12 w-full rounded-md border border-[#CBD5E1] bg-white px-3 text-[15px] text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10";
const selectClass =
  "h-12 w-full rounded-md border border-[#CBD5E1] bg-white px-3 text-[15px] text-[#0F172A] outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10";
const labelClass = "mb-2 block text-sm font-semibold text-[#0F172A]";
const primaryButton =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#111827] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F2937] disabled:opacity-50";
const secondaryButton =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-50";
const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F8FAFC] text-[#334155] transition hover:bg-[#EEF2F7]";

function formatDateTime(value?: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: Status) {
  if (status === "Đang gửi") {
    return "bg-[#DBEAFE] text-[#2563EB]";
  }

  if (status === "Đã nhận lại") {
    return "bg-[#DCFCE7] text-[#16A34A]";
  }

  if (status === "Đã đổi quà") {
    return "bg-[#FEF3C7] text-[#B45309]";
  }

  return "bg-[#FEE2E2] text-[#DC2626]";
}

function cardActionClass(cardAction: CardAction) {
  return cardAction === "Lấy thẻ"
    ? "bg-[#FEE2E2] text-[#B91C1C]"
    : "bg-[#DCFCE7] text-[#166534]";
}

function actorName(deposit: Deposit, field: "created" | "updated") {
  if (field === "created") {
    return deposit.createdByName || deposit.createdBy?.displayName || "N/A";
  }

  return deposit.updatedByName || deposit.updatedBy?.displayName || "N/A";
}

function formatShortDateTime(value?: string) {
  if (!value) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.hour}h${byType.minute} ${byType.day}/${byType.month}/${byType.year}`;
}

function normalizePhoneInput(phone: string) {
  return phone.trim().replace(/[\s().-]/g, "");
}

async function apiRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? "Có lỗi xảy ra.");
  }

  return data as T;
}

function PhoneSuggestionBubble({
  suggestions,
  onSelect,
}: {
  suggestions: DepositSuggestion[];
  onSelect: (suggestion: DepositSuggestion) => void;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="phone-suggestion-bubble mt-2 overflow-hidden rounded-lg border border-[#CBD5E1] bg-white shadow-lg">
      {suggestions.map((suggestion) => (
        <button
          className="flex w-full items-center justify-between gap-3 border-b border-[#E5E7EB] px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-[#F8FAFC]"
          key={suggestion.phone}
          onClick={() => onSelect(suggestion)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block truncate font-bold text-[#0F172A]">{suggestion.fullName}</span>
            <span className="block text-xs font-semibold text-[#2563EB]">{suggestion.phone}</span>
          </span>
          <span className="shrink-0 text-right text-xs font-semibold text-[#64748B]">
            {suggestion.activeDeposits > 0 ? (
              <>
                <span className="block text-[#2563EB]">
                  {suggestion.totalCards} thẻ · {suggestion.totalBalls} bi
                </span>
                <span>{suggestion.activeDeposits} dòng đang gửi</span>
              </>
            ) : (
              <>
                <span className={`inline-flex rounded px-2 py-0.5 ${statusClass(suggestion.latestStatus)}`}>
                  {suggestion.latestStatus}
                </span>
                <span className="mt-1 block">{formatDate(suggestion.latestDepositDate)}</span>
              </>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

function lookupFromSuggestion(suggestion: DepositSuggestion, suggestions: DepositSuggestion[]): DepositLookup {
  return {
    found: suggestion.activeDeposits > 0,
    phone: suggestion.phone,
    fullName: suggestion.fullName,
    activeDeposits: suggestion.activeDeposits,
    totalCards: suggestion.totalCards,
    totalBalls: suggestion.totalBalls,
    suggestions,
  };
}

function StaffGate({ onEnter }: { onEnter: (name: string) => void }) {
  const [name, setName] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();

    if (!value) {
      return;
    }

    localStorage.setItem(staffStorageKey, value);
    onEnter(value);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-[#0F172A]">
      <section className="w-full max-w-md rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#111827] text-white">
            <UserRound aria-hidden="true" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{appTitle}</h1>
            <p className="text-sm text-[#64748B]">Nhập tên nhân viên ca hiện tại</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <label>
            <span className={labelClass}>Tên nhân viên</span>
            <input
              autoFocus
              className={inputClass}
              placeholder="Ví dụ: Danh Thai"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <button className={`${primaryButton} w-full`} type="submit">
            Tiếp tục
          </button>
        </form>
      </section>
    </main>
  );
}

export default function Dashboard({ mode }: { mode: Mode }) {
  const isAdmin = mode === "admin";
  const [staffName, setStaffName] = useState(isAdmin ? adminDisplayName : "");
  const [clock, setClock] = useState<ReturnType<typeof getHanoiParts> | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [summary, setSummary] = useState<DepositSummary>(emptySummary);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: depositPageLimit,
    hasMore: false,
  });
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [filters, setFilters] = useState<DepositFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<DepositFilters>(emptyFilters);
  const [depositForm, setDepositForm] = useState(() => getDefaultDepositForm());
  const [depositLookup, setDepositLookup] = useState<DepositLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [filterLookup, setFilterLookup] = useState<DepositLookup | null>(null);
  const [filterLookupLoading, setFilterLookupLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    depositDate: "",
    depositTime: "",
    cards: "0",
    balls: "0",
    status: "Đang gửi" as Status,
  });

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStaffName(localStorage.getItem(staffStorageKey) ?? "");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAdmin]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setClock(getHanoiParts()), 0);
    const intervalId = window.setInterval(() => setClock(getHanoiParts()), 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const now = getHanoiNow();

      setDepositForm((current) => ({
        ...current,
        depositDate: current.depositDate || now.date,
        depositTime: current.depositTime || now.time,
      }));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAdmin]);

  const { activeDeposits, historyEntries, todayDeposits, totalBalls, totalCards } = summary;
  const normalizedDepositPhone = normalizePhoneInput(depositForm.phone);
  const normalizedFilterPhone = normalizePhoneInput(filters.phone);
  const activeDepositLookup =
    normalizedDepositPhone.length >= 8 && depositLookup?.phone === normalizedDepositPhone
      ? depositLookup
      : null;
  const depositSuggestions =
    normalizedDepositPhone.length >= minPhoneSuggestionDigits && depositLookup?.phone === normalizedDepositPhone
      ? depositLookup.suggestions
      : [];
  const filterSuggestions =
    normalizedFilterPhone.length >= minPhoneSuggestionDigits && filterLookup?.phone === normalizedFilterPhone
      ? filterLookup.suggestions
      : [];

  const pendingDepositTotals = useMemo(() => {
    if (!activeDepositLookup?.found) {
      return null;
    }

    const cardAmount = Number(depositForm.cards) || 0;
    const ballAmount = Number(depositForm.balls) || 0;

    return {
      cards:
        depositForm.cardAction === "Lấy thẻ"
          ? activeDepositLookup.totalCards - cardAmount
          : activeDepositLookup.totalCards + cardAmount,
      balls: activeDepositLookup.totalBalls + (depositForm.cardAction === "Lấy thẻ" ? 0 : ballAmount),
    };
  }, [activeDepositLookup, depositForm.balls, depositForm.cardAction, depositForm.cards]);

  const showNotice = useCallback((type: Notice["type"], text: string) => {
    setNotice({ type, text });
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const data = await apiRequest<DepositSummary>("/api/deposits/summary");
      setSummary(data);
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không tải được tổng.");
    }
  }, [showNotice]);

  const buildDepositQuery = useCallback(
    (filterValues: DepositFilters, pageToLoad: number, limit: number) => {
      const params = new URLSearchParams();
      params.set("page", String(pageToLoad));
      params.set("limit", String(limit));

      const name = filterValues.name.trim();
      const phone = filterValues.phone.trim();

      if (name) {
        params.set("name", name);
      }

      if (phone) {
        params.set("phone", phone);
      }

      if (isAdmin && filterValues.date) {
        params.set("date", filterValues.date);
      }

      if (filterValues.status) {
        params.set("status", filterValues.status);
      }

      return params;
    },
    [isAdmin],
  );

  const loadDeposits = useCallback(async (filterValues: DepositFilters, pageToLoad = 1, append = false) => {
    setLoading(true);

    try {
      const params = buildDepositQuery(filterValues, pageToLoad, depositPageLimit);
      const data = await apiRequest<DepositListResponse>(`/api/deposits?${params.toString()}`);
      setDeposits((current) => (append ? [...current, ...data.deposits] : data.deposits));
      setPagination({
        total: data.total,
        page: data.page,
        limit: data.limit,
        hasMore: data.hasMore,
      });
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [buildDepositQuery, showNotice]);

  const fetchAllDeposits = useCallback(async (filterValues: DepositFilters) => {
    const allDeposits: Deposit[] = [];
    let pageToLoad = 1;

    while (true) {
      const params = buildDepositQuery(filterValues, pageToLoad, exportPageLimit);
      const data = await apiRequest<DepositListResponse>(`/api/deposits?${params.toString()}`);

      allDeposits.push(...data.deposits);

      if (!data.hasMore || data.deposits.length === 0) {
        break;
      }

      pageToLoad += 1;
    }

    return allDeposits;
  }, [buildDepositQuery]);

  useEffect(() => {
    if (!staffName) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadSummary();
      void loadDeposits(emptyFilters, 1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDeposits, loadSummary, staffName]);

  useEffect(() => {
    if (normalizedDepositPhone.length < minPhoneSuggestionDigits) {
      const timeoutId = window.setTimeout(() => {
        setDepositLookup(null);
        setLookupLoading(false);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLookupLoading(true);

      try {
        const data = await apiRequest<DepositLookup>(
          `/api/deposits/lookup?phone=${encodeURIComponent(normalizedDepositPhone)}`,
          { signal: controller.signal },
        );

        if (controller.signal.aborted) {
          return;
        }

        setDepositLookup(data);

        if (data.found && data.fullName) {
          setDepositForm((current) => {
            if (normalizePhoneInput(current.phone) !== data.phone || current.fullName.trim()) {
              return current;
            }

            return {
              ...current,
              fullName: data.fullName,
            };
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setDepositLookup(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLookupLoading(false);
        }
      }
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedDepositPhone]);

  useEffect(() => {
    if (normalizedFilterPhone.length < minPhoneSuggestionDigits) {
      const timeoutId = window.setTimeout(() => {
        setFilterLookup(null);
        setFilterLookupLoading(false);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setFilterLookupLoading(true);

      try {
        const data = await apiRequest<DepositLookup>(
          `/api/deposits/lookup?phone=${encodeURIComponent(normalizedFilterPhone)}`,
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          setFilterLookup(data);
        }
      } catch {
        if (!controller.signal.aborted) {
          setFilterLookup(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setFilterLookupLoading(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedFilterPhone]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextFilters = { ...filters };
    setAppliedFilters(nextFilters);
    void loadDeposits(nextFilters, 1);
  }

  function handleClearFilters() {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setFilterLookup(null);
    void loadDeposits(emptyFilters, 1);
  }

  function handleReloadDeposits() {
    void loadSummary();
    void loadDeposits(appliedFilters, 1);
  }

  function handleLoadMore() {
    void loadDeposits(appliedFilters, pagination.page + 1, true);
  }

  function selectDepositSuggestion(suggestion: DepositSuggestion) {
    setDepositForm((current) => ({
      ...current,
      fullName: suggestion.fullName,
      phone: suggestion.phone,
    }));
    setDepositLookup(lookupFromSuggestion(suggestion, [suggestion]));
  }

  function selectFilterSuggestion(suggestion: DepositSuggestion) {
    setFilters((current) => ({
      ...current,
      name: current.name.trim() ? current.name : suggestion.fullName,
      phone: suggestion.phone,
    }));
    setFilterLookup(lookupFromSuggestion(suggestion, [suggestion]));
  }

  if (!staffName) {
    return <StaffGate onEnter={setStaffName} />;
  }

  async function handleCreateDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = {
        fullName: depositForm.fullName,
        phone: depositForm.phone,
        actorName: staffName,
        cardAction: depositForm.cardAction,
        cards: Number(depositForm.cards),
        balls: Number(depositForm.balls),
        ...(isAdmin
          ? {
              depositDate: depositForm.depositDate,
              depositTime: depositForm.depositTime,
            }
          : {}),
      };
      const data = await apiRequest<{ deposit: Deposit }>("/api/deposits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      setDeposits((current) => {
        const existingIndex = current.findIndex((deposit) => deposit.id === data.deposit.id);

        if (existingIndex === -1) {
          return [data.deposit, ...current];
        }

        return current.map((deposit) => (deposit.id === data.deposit.id ? data.deposit : deposit));
      });
      setDepositForm(getDefaultDepositForm(isAdmin));
      setDepositLookup(null);
      void loadSummary();
      void loadDeposits(appliedFilters, 1);
      showNotice("success", "Đã lưu chi tiết lần gửi mới.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không lưu được bản ghi.");
    }
  }

  function openEdit(deposit: Deposit) {
    setEditingDeposit(deposit);
    setEditForm({
      fullName: deposit.fullName,
      phone: deposit.phone,
      depositDate: deposit.depositDate,
      depositTime: deposit.depositTime,
      cards: String(deposit.cards),
      balls: String(deposit.balls),
      status: deposit.status,
    });
  }

  async function handleUpdateDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingDeposit) {
      return;
    }

    const payload = isAdmin
      ? {
          ...editForm,
          actorName: staffName,
          cards: Number(editForm.cards),
          balls: Number(editForm.balls),
        }
      : {
          actorName: staffName,
          cards: Number(editForm.cards),
          balls: Number(editForm.balls),
          status: editForm.status,
        };

    try {
      const data = await apiRequest<{ deposit: Deposit }>(
        `/api/deposits/${editingDeposit.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      setDeposits((current) =>
        current.map((deposit) => (deposit.id === data.deposit.id ? data.deposit : deposit)),
      );
      setEditingDeposit(null);
      void loadSummary();
      void loadDeposits(appliedFilters, 1);
      showNotice("success", "Đã cập nhật bản ghi.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không cập nhật được.");
    }
  }

  async function handleDeleteDeposit(deposit: Deposit) {
    const confirmed = window.confirm(`Xóa bản ghi của ${deposit.fullName}?`);

    if (!confirmed) {
      return;
    }

    try {
      await apiRequest<{ ok: boolean }>(`/api/deposits/${deposit.id}`, {
        method: "DELETE",
      });
      setDeposits((current) => current.filter((item) => item.id !== deposit.id));
      void loadSummary();
      void loadDeposits(appliedFilters, 1);
      showNotice("success", "Đã xóa bản ghi.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không xóa được.");
    }
  }

  function switchStaff() {
    localStorage.removeItem(staffStorageKey);
    setStaffName("");
  }

  async function handleAdminLogout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không đăng xuất được.");
    }
  }

  async function handleExportExcel() {
    if (pagination.total === 0) {
      showNotice("error", "Không có dữ liệu để xuất Excel.");
      return;
    }

    setExporting(true);

    try {
      const exportDeposits = await fetchAllDeposits(appliedFilters);

      if (exportDeposits.length === 0) {
        showNotice("error", "Không có dữ liệu để xuất Excel.");
        return;
      }

      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const exportedAt = getHanoiParts();
      const titleCell: Cell = {
        value: `${appTitle} - Danh sách gửi giữ`,
        fontWeight: "bold",
        fontSize: 16,
      };
      const noteCell: Cell = {
        value: `Xuất lúc ${exportedAt.time} ${formatDate(exportedAt.date)} - Nhân viên: ${staffName}`,
        textColor: "#64748B",
      };
      const headerStyle = {
        fontWeight: "bold" as const,
        backgroundColor: "#F1F5F9",
        textColor: "#0F172A",
        borderColor: "#CBD5E1",
        borderStyle: "thin" as const,
      };
      const header = (value: string): Cell => ({
        value,
        ...headerStyle,
      });
      const depositRows = exportDeposits.map((deposit, index) => [
        index + 1,
        deposit.fullName,
        deposit.phone,
        formatDate(deposit.depositDate),
        deposit.depositTime,
        deposit.cards,
        deposit.balls,
        deposit.totalText,
        deposit.cardAction,
        deposit.status,
        actorName(deposit, "created"),
        actorName(deposit, "updated"),
        formatDateTime(deposit.createdAt),
        formatDateTime(deposit.updatedAt),
      ]);
      const depositSheet: SheetData = [
        [titleCell],
        [noteCell],
        [],
        [
          header("STT"),
          header("Họ và tên"),
          header("SĐT"),
          header("Ngày gửi"),
          header("Giờ gửi"),
          header("Thẻ"),
          header("Bi"),
          header("Tổng"),
          header("Tùy chọn"),
          header("Trạng thái"),
          header("Nhân viên tạo"),
          header("Nhân viên sửa"),
          header("Tạo lúc"),
          header("Cập nhật lúc"),
        ],
        ...depositRows,
      ];
      const sheets: Sheet<Blob>[] = [
        {
          sheet: "Gui giu",
          data: depositSheet,
          columns: [
            { width: 8 },
            { width: 26 },
            { width: 18 },
            { width: 14 },
            { width: 12 },
            { width: 10 },
            { width: 10 },
            { width: 32 },
            { width: 14 },
            { width: 16 },
            { width: 18 },
            { width: 18 },
            { width: 20 },
            { width: 20 },
          ],
          stickyRowsCount: 4,
        },
      ];

      if (isAdmin) {
        const historyRows = exportDeposits.flatMap((deposit) =>
          deposit.history.map((entry) => [
            deposit.fullName,
            deposit.phone,
            formatDate(deposit.depositDate),
            deposit.depositTime,
            entry.actorName,
            entry.action,
            formatDateTime(entry.at),
            entry.content,
          ]),
        );

        sheets.push({
          sheet: "Lich su",
          data: [
            [
              {
                value: `${appTitle} - Lịch sử cập nhật`,
                fontWeight: "bold",
                fontSize: 16,
              },
            ],
            [noteCell],
            [],
            [
              header("Họ và tên"),
              header("SĐT"),
              header("Ngày gửi"),
              header("Giờ gửi"),
              header("Nhân viên"),
              header("Hành động"),
              header("Thời gian"),
              header("Nội dung thay đổi"),
            ],
            ...historyRows,
          ],
          columns: [
            { width: 26 },
            { width: 18 },
            { width: 14 },
            { width: 12 },
            { width: 18 },
            { width: 14 },
            { width: 20 },
            { width: 56 },
          ],
          stickyRowsCount: 4,
        });
      }

      await writeExcelFile(sheets, {
        fontFamily: "Arial",
        fontSize: 11,
      }).toFile(
        `pinball-gui-giu-${exportedAt.date}-${exportedAt.shortTime.replace(":", "-")}.xlsx`,
      );
      showNotice("success", "Đã xuất file Excel.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không xuất được Excel.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className={`min-h-screen text-[#0F172A] ${isAdmin ? "bg-[#F1F5F9]" : "bg-[#F8FAFC]"}`}>
      <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#111827] text-white sm:h-11 sm:w-11">
              {isAdmin ? <Eye aria-hidden="true" size={22} /> : <Ticket aria-hidden="true" size={22} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-bold leading-tight sm:text-lg">
                  {isAdmin ? `Admin ${appTitle}` : appTitle}
                </h1>
                {isAdmin ? (
                  <span className="rounded-full bg-[#111827] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Audit
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-[#64748B] sm:text-sm">
                {isAdmin ? "Kiểm tra ngày giờ, thẻ, bi và lịch sử" : "Nhập nhanh gửi giữ tại quầy"}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none sm:gap-4">
            <div className="text-right text-xs font-semibold sm:text-sm">
              {clock ? (
                <>
                  <div>{clock.time}</div>
                  <div className="font-normal text-[#64748B]">{formatDate(clock.date)}</div>
                </>
              ) : (
                <div className="h-9 w-20 animate-pulse rounded bg-[#E2E8F0]" />
              )}
            </div>
            <div className="hidden h-10 w-px bg-[#E5E7EB] sm:block" />
            <button
              aria-label={isAdmin ? "Đăng xuất Admin" : "Đổi nhân viên"}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F8FAFC] text-[#334155] transition hover:bg-[#EEF2F7]"
              onClick={isAdmin ? handleAdminLogout : switchStaff}
              title={isAdmin ? "Đăng xuất Admin" : "Đổi nhân viên"}
              type="button"
            >
              <LogOut aria-hidden="true" size={17} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-0 lg:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-[#E5E7EB] bg-white px-4 py-8 lg:block">
          <nav className="space-y-2">
            <div className="flex items-center gap-3 rounded-md bg-[#F8FAFC] px-4 py-3 text-sm font-semibold">
              <LayoutDashboard aria-hidden="true" size={18} />
              Tổng quan
            </div>
            <div className="px-4 pt-6 text-xs font-bold uppercase text-[#64748B]">Quản lý</div>
            <div className="flex items-center gap-3 rounded-md px-4 py-3 text-sm text-[#334155]">
              <Ticket aria-hidden="true" size={18} />
              Gửi giữ
            </div>
            <div className="flex items-center gap-3 rounded-md px-4 py-3 text-sm text-[#334155]">
              <Coins aria-hidden="true" size={18} />
              Thẻ & Bi
            </div>
            {isAdmin ? (
              <div className="flex items-center gap-3 rounded-md px-4 py-3 text-sm text-[#334155]">
                <Clock3 aria-hidden="true" size={18} />
                Lịch sử chi tiết
              </div>
            ) : null}
          </nav>
        </aside>

        <section className="space-y-4 px-3 py-4 pb-8 sm:px-4 lg:space-y-5 lg:px-6">
          {isAdmin ? (
            <div className="flex sm:items-center sm:justify-end">
              <Link className={secondaryButton} href="/">
                <Ticket aria-hidden="true" size={18} />
                Xem trang nhân viên
              </Link>
            </div>
          ) : null}

          {isAdmin ? (
            <section className="rounded-lg border border-[#CBD5E1] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-2 inline-flex rounded-full bg-[#111827] px-3 py-1 text-xs font-bold uppercase text-white">
                    Trang admin
                  </div>
                  <h2 className="text-xl font-bold">Bảng kiểm tra chi tiết</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748B]">
                    Dùng để đối soát ngày giờ gửi, nhân viên thao tác, lịch sử cập nhật và xuất
                    Excel. Trang nhân viên chỉ giữ luồng nhập nhanh.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:min-w-[280px]">
                  <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                    <div className="text-xs font-semibold text-[#64748B]">Bản ghi hôm nay</div>
                    <div className="mt-1 text-2xl font-bold">{todayDeposits}</div>
                  </div>
                  <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                    <div className="text-xs font-semibold text-[#64748B]">Dòng lịch sử</div>
                    <div className="mt-1 text-2xl font-bold">{historyEntries}</div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {notice ? (
            <div
              className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm font-semibold ${
                notice.type === "success"
                  ? "border-[#86EFAC] bg-[#DCFCE7] text-[#166534]"
                  : "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]"
              }`}
            >
              <span>{notice.text}</span>
              <button
                aria-label="Đóng thông báo"
                className="rounded p-1 hover:bg-black/5"
                onClick={() => setNotice(null)}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          ) : null}

          <section className={`grid gap-3 ${isAdmin ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 md:grid-cols-3"}`}>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] sm:h-14 sm:w-14">
                  <Ticket aria-hidden="true" size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#334155] sm:text-sm">Đang gửi</div>
                  <div className="text-2xl font-bold sm:text-3xl">{activeDeposits}</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] sm:h-14 sm:w-14">
                  <CalendarDays aria-hidden="true" size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#334155] sm:text-sm">Thẻ còn giữ</div>
                  <div className="text-2xl font-bold sm:text-3xl">{totalCards}</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] sm:h-14 sm:w-14">
                  <Coins aria-hidden="true" size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#334155] sm:text-sm">Bi còn giữ</div>
                  <div className="text-2xl font-bold sm:text-3xl">{totalBalls}</div>
                </div>
              </div>
            </div>
            {isAdmin ? (
              <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] sm:h-14 sm:w-14">
                    <Clock3 aria-hidden="true" size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#334155] sm:text-sm">Hôm nay</div>
                    <div className="text-2xl font-bold sm:text-3xl">{todayDeposits}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">{isAdmin ? "Tạo bản ghi mới" : "Nhập gửi giữ"}</h2>
                <p className="text-xs text-[#64748B]">
                  {isAdmin
                    ? "Chọn ngày giờ gửi khi nhập lại dữ liệu cũ."
                    : "Ngày và giờ gửi tự đồng bộ theo UTC+7 khi bấm lưu."}
                </p>
              </div>
              {isAdmin ? (
                <span className="inline-flex w-fit rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-semibold text-[#334155]">
                  Admin được tạo bản ghi theo ngày/giờ cũ
                </span>
              ) : null}
            </div>
            <div className="mb-4 flex items-center gap-3 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-[#334155] shadow-sm">
                <UserRound aria-hidden="true" size={18} />
              </div>
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-[#64748B]">Nhân viên</div>
                <div className="truncate text-base font-bold text-[#0F172A]">{staffName}</div>
              </div>
            </div>
            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:gap-4" onSubmit={handleCreateDeposit}>
              {isAdmin ? (
                <div className="grid gap-3 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-12">
                  <label>
                    <span className={labelClass}>Ngày gửi</span>
                    <input
                      className={inputClass}
                      type="date"
                      value={depositForm.depositDate}
                      onChange={(event) =>
                        setDepositForm((current) => ({
                          ...current,
                          depositDate: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Giờ gửi</span>
                    <input
                      className={inputClass}
                      type="time"
                      value={depositForm.depositTime}
                      onChange={(event) =>
                        setDepositForm((current) => ({
                          ...current,
                          depositTime: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                </div>
              ) : null}

              <label className="sm:col-span-2 lg:col-span-3">
                <span className={labelClass}>Họ và tên khách</span>
                <input
                  className={inputClass}
                  placeholder="Nhập họ và tên"
                  value={depositForm.fullName}
                  onChange={(event) =>
                    setDepositForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className={labelClass} htmlFor="deposit-phone">
                  Số điện thoại
                </label>
                <input
                  id="deposit-phone"
                  className={inputClass}
                  inputMode="tel"
                  placeholder="Nhập số điện thoại"
                  value={depositForm.phone}
                  onChange={(event) =>
                    setDepositForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  required
                />
                <PhoneSuggestionBubble
                  suggestions={depositSuggestions}
                  onSelect={selectDepositSuggestion}
                />
                {lookupLoading && normalizedDepositPhone.length >= minPhoneSuggestionDigits ? (
                  <span className="mt-2 block text-xs font-semibold leading-5 text-[#64748B]">
                    Đang kiểm tra SĐT...
                  </span>
                ) : activeDepositLookup?.found && pendingDepositTotals ? (
                  <span
                    className={`mt-2 block text-xs font-semibold leading-5 ${
                      pendingDepositTotals.cards < 0 ? "text-[#DC2626]" : "text-[#2563EB]"
                    }`}
                  >
                    Hiện có: {activeDepositLookup.totalCards} thẻ, {activeDepositLookup.totalBalls} bi - Sau lưu:{" "}
                    {pendingDepositTotals.cards} thẻ, {pendingDepositTotals.balls} bi
                    {activeDepositLookup.activeDeposits > 1
                      ? ` - ${activeDepositLookup.activeDeposits} dòng cùng SĐT`
                      : ""}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:contents">
                <label className="lg:col-span-2">
                  <span className={labelClass}>
                    {depositForm.cardAction === "Lấy thẻ" ? "Thẻ lấy" : "Thẻ gửi"}
                  </span>
                  <input
                    className={inputClass}
                    min="0"
                    type="number"
                    value={depositForm.cards}
                    onChange={(event) =>
                      setDepositForm((current) => ({
                        ...current,
                        cards: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label className="lg:col-span-2">
                  <span className={labelClass}>Bi</span>
                  <input
                    className={`${inputClass} disabled:bg-[#F1F5F9] disabled:text-[#94A3B8]`}
                    disabled={depositForm.cardAction === "Lấy thẻ"}
                    min="0"
                    type="number"
                    value={depositForm.balls}
                    onChange={(event) =>
                      setDepositForm((current) => ({
                        ...current,
                        balls: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:col-span-2 lg:col-span-2">
                <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-2">
                  <div className="mb-2 text-xs font-semibold text-[#64748B]">Tùy chọn</div>
                  <div className="grid grid-cols-2 gap-1">
                    {cardActions.map((cardAction) => {
                      const isSelected = depositForm.cardAction === cardAction;

                      return (
                        <button
                          aria-pressed={isSelected}
                          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded px-2 text-xs font-bold transition ${
                            isSelected
                              ? cardActionClass(cardAction)
                              : "bg-white text-[#334155] hover:bg-[#F8FAFC]"
                          }`}
                          key={cardAction}
                          onClick={() =>
                            setDepositForm((current) => ({
                              ...current,
                              cardAction,
                              balls: cardAction === "Lấy thẻ" ? "0" : current.balls,
                            }))
                          }
                          type="button"
                        >
                          {cardAction === "Gửi thẻ" ? (
                            <Ticket aria-hidden="true" size={15} />
                          ) : (
                            <RefreshCw aria-hidden="true" size={15} />
                          )}
                          {cardAction}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button className={`${primaryButton} w-full px-3`} type="submit">
                  <Plus aria-hidden="true" size={18} />
                  Lưu
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:gap-4"
              onSubmit={handleSearch}
            >
              <label className="lg:col-span-3">
                <span className={labelClass}>Tìm theo họ tên</span>
                <input
                  className={inputClass}
                  placeholder="Nhập họ tên"
                  value={filters.name}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <div className="lg:col-span-3">
                <label className={labelClass} htmlFor="filter-phone">
                  Tìm theo SĐT
                </label>
                <input
                  id="filter-phone"
                  className={inputClass}
                  inputMode="tel"
                  placeholder="Nhập số điện thoại"
                  value={filters.phone}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, phone: event.target.value }))
                  }
                />
                <PhoneSuggestionBubble
                  suggestions={filterSuggestions}
                  onSelect={selectFilterSuggestion}
                />
                {filterLookupLoading && normalizedFilterPhone.length >= minPhoneSuggestionDigits ? (
                  <span className="mt-2 block text-xs font-semibold leading-5 text-[#64748B]">
                    Đang tìm khách...
                  </span>
                ) : null}
              </div>
              {isAdmin ? (
                <label className="lg:col-span-2">
                  <span className={labelClass}>Ngày gửi</span>
                  <input
                    className={inputClass}
                    type="date"
                    value={filters.date}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, date: event.target.value }))
                    }
                  />
                </label>
              ) : null}
              <label className={isAdmin ? "lg:col-span-2" : "sm:col-span-2 lg:col-span-3"}>
                <span className={labelClass}>Trạng thái</span>
                <select
                  className={selectClass}
                  value={filters.status}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="">Tất cả</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-2 lg:flex lg:items-end">
                <button className={`${primaryButton} w-full`} type="submit">
                  <Search aria-hidden="true" size={18} />
                  Tìm
                </button>
                <button
                  className={`${secondaryButton} w-full`}
                  onClick={handleClearFilters}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={18} />
                  Xóa lọc
                </button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-lg font-bold">
                  {isAdmin ? "Bảng kiểm tra chi tiết" : "Danh sách gửi giữ"}
                </h2>
                <p className="text-xs text-[#64748B]">
                  {isAdmin
                    ? "Admin xem ngày giờ, nhân viên, trạng thái và lịch sử từng bản ghi."
                    : "Chạm vào cập nhật để sửa thẻ, bi và trạng thái."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <button
                  className={`${secondaryButton} w-full sm:w-auto`}
                  disabled={exporting || pagination.total === 0}
                  onClick={() => void handleExportExcel()}
                  type="button"
                >
                  <FileDown aria-hidden="true" size={18} />
                  {exporting ? "Đang xuất" : "Xuất Excel"}
                </button>
                <button
                  className={`${secondaryButton} w-full sm:w-auto`}
                  onClick={handleReloadDeposits}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={18} />
                  {loading ? "Đang tải" : "Tải lại"}
                </button>
              </div>
            </div>

            <div className="divide-y divide-[#E5E7EB] lg:hidden">
              {deposits.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#64748B]">Không có bản ghi.</div>
              ) : null}

              {deposits.map((deposit) => (
                <article className="p-4" key={deposit.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold">{deposit.fullName}</h3>
                      <a className="mt-1 block text-sm font-semibold text-[#2563EB]" href={`tel:${deposit.phone}`}>
                        {deposit.phone}
                      </a>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${statusClass(
                          deposit.status,
                        )}`}
                      >
                        {deposit.status}
                      </span>
                      <span
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${cardActionClass(
                          deposit.cardAction,
                        )}`}
                      >
                        {deposit.cardAction}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    {isAdmin ? (
                      <>
                        <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                          <div className="text-xs font-semibold text-[#64748B]">Ngày gửi</div>
                          <div className="mt-1 font-bold">{formatDate(deposit.depositDate)}</div>
                        </div>
                        <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                          <div className="text-xs font-semibold text-[#64748B]">Giờ gửi</div>
                          <div className="mt-1 font-bold">{deposit.depositTime}</div>
                        </div>
                      </>
                    ) : null}
                    <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      <div className="text-xs font-semibold text-[#64748B]">Thẻ</div>
                      <div className="mt-1 text-xl font-bold">{deposit.cards}</div>
                    </div>
                    <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      <div className="text-xs font-semibold text-[#64748B]">Bi</div>
                      <div className="mt-1 text-xl font-bold">{deposit.balls}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md border border-[#E5E7EB] bg-white p-3 text-sm">
                    <div className="text-xs font-semibold text-[#64748B]">Tổng</div>
                    <div className="mt-1 font-bold">{deposit.totalText}</div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
                    <span>
                      Tạo bởi: {actorName(deposit, "created")} lúc {formatShortDateTime(deposit.createdAt)}
                    </span>
                    {isAdmin ? <span>Sửa: {actorName(deposit, "updated")}</span> : null}
                  </div>

                  <div
                    className={`mt-3 grid gap-2 ${
                      isAdmin ? "grid-cols-[1fr_48px_48px]" : "grid-cols-1"
                    }`}
                  >
                    <button
                      className={`${primaryButton} min-h-12 w-full`}
                      onClick={() => openEdit(deposit)}
                      type="button"
                    >
                      <Save aria-hidden="true" size={18} />
                      Cập nhật
                    </button>
                    {isAdmin ? (
                      <button
                        className={`${secondaryButton} min-h-12 px-0`}
                        aria-label="Lịch sử"
                        onClick={() =>
                          setExpandedHistoryId((current) =>
                            current === deposit.id ? null : deposit.id,
                          )
                        }
                        type="button"
                      >
                        <Eye aria-hidden="true" size={18} />
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button
                        className={`${secondaryButton} min-h-12 px-0 text-[#DC2626]`}
                        aria-label="Xóa"
                        onClick={() => void handleDeleteDeposit(deposit)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={18} />
                      </button>
                    ) : null}
                  </div>

                  {isAdmin && expandedHistoryId === deposit.id ? (
                    <div className="mt-3 space-y-2 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      {deposit.history.length === 0 ? (
                        <div className="text-sm text-[#64748B]">Chưa có lịch sử cập nhật.</div>
                      ) : null}
                      {deposit.history.map((entry) => (
                        <div className="rounded-md bg-white px-3 py-2" key={entry.id || `${entry.at}-${entry.content}`}>
                          <div className="text-xs font-semibold text-[#64748B]">
                            {formatDateTime(entry.at)} · {entry.actorName} · {entry.action}
                          </div>
                          <div className="mt-1 text-sm">{entry.content}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                <thead className="bg-[#F8FAFC] text-xs font-bold uppercase text-[#334155]">
                  <tr>
                    <th className="px-5 py-3">Họ và tên</th>
                    <th className="px-5 py-3">SĐT</th>
                    {isAdmin ? <th className="px-5 py-3">Ngày gửi</th> : null}
                    {isAdmin ? <th className="px-5 py-3">Giờ gửi</th> : null}
                    <th className="px-5 py-3 text-right">Thẻ</th>
                    <th className="px-5 py-3 text-right">Bi</th>
                    <th className="px-5 py-3">Tổng</th>
                    <th className="px-5 py-3">Tùy chọn</th>
                    <th className="px-5 py-3">Trạng thái</th>
                    <th className="px-5 py-3">Nhân viên</th>
                    <th className="px-5 py-3">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {deposits.length === 0 ? (
                    <tr>
                      <td
                        className="px-5 py-8 text-center text-[#64748B]"
                        colSpan={isAdmin ? 11 : 9}
                      >
                        Không có bản ghi.
                      </td>
                    </tr>
                  ) : null}

                  {deposits.map((deposit) => (
                    <Fragment key={deposit.id}>
                      <tr className="align-top hover:bg-[#F8FAFC]">
                        <td className="px-5 py-4 font-semibold">{deposit.fullName}</td>
                        <td className="px-5 py-4">{deposit.phone}</td>
                        {isAdmin ? <td className="px-5 py-4">{formatDate(deposit.depositDate)}</td> : null}
                        {isAdmin ? <td className="px-5 py-4">{deposit.depositTime}</td> : null}
                        <td className="px-5 py-4 text-right font-semibold">{deposit.cards}</td>
                        <td className="px-5 py-4 text-right font-semibold">{deposit.balls}</td>
                        <td className="px-5 py-4">{deposit.totalText}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-md px-3 py-1 text-xs font-semibold ${cardActionClass(
                              deposit.cardAction,
                            )}`}
                          >
                            {deposit.cardAction}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-md px-3 py-1 text-xs font-semibold ${statusClass(
                              deposit.status,
                            )}`}
                          >
                            {deposit.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div>{actorName(deposit, "created")}</div>
                          <div className="text-xs text-[#64748B]">
                            Lúc {formatShortDateTime(deposit.createdAt)}
                          </div>
                          {isAdmin ? (
                            <div className="text-xs text-[#64748B]">
                              Sửa: {actorName(deposit, "updated")}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className={iconButton}
                              aria-label="Sửa"
                              onClick={() => openEdit(deposit)}
                              type="button"
                            >
                              <Save aria-hidden="true" size={16} />
                            </button>
                            {isAdmin ? (
                              <button
                                className={iconButton}
                                aria-label="Lịch sử"
                                onClick={() =>
                                  setExpandedHistoryId((current) =>
                                    current === deposit.id ? null : deposit.id,
                                  )
                                }
                                type="button"
                              >
                                <Eye aria-hidden="true" size={16} />
                              </button>
                            ) : null}
                            {isAdmin ? (
                              <button
                                className={iconButton}
                                aria-label="Xóa"
                                onClick={() => void handleDeleteDeposit(deposit)}
                                type="button"
                              >
                                <Trash2 aria-hidden="true" size={16} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isAdmin && expandedHistoryId === deposit.id ? (
                        <tr className="bg-[#F8FAFC]">
                          <td className="px-5 py-4" colSpan={10}>
                            <div className="space-y-2">
                              {deposit.history.map((entry) => (
                                <div
                                  className="rounded-md border border-[#E5E7EB] bg-white px-3 py-2"
                                  key={entry.id || `${entry.at}-${entry.content}`}
                                >
                                  <div className="text-xs font-semibold text-[#64748B]">
                                    {formatDateTime(entry.at)} · {entry.actorName} · {entry.action}
                                  </div>
                                  <div className="mt-1 text-sm">{entry.content}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.hasMore ? (
              <div className="flex flex-col items-center gap-2 border-t border-[#E5E7EB] px-4 py-4 sm:px-5">
                <button
                  className={secondaryButton}
                  disabled={loading}
                  onClick={handleLoadMore}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={18} />
                  {loading ? "Đang tải" : "Tải thêm"}
                </button>
                <div className="text-xs text-[#64748B]">
                  Đã hiển thị {deposits.length}/{pagination.total}
                </div>
              </div>
            ) : null}
          </section>
        </section>
      </div>

      {editingDeposit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/50 px-3 py-0 sm:items-center sm:px-4 sm:py-6">
          <section className="max-h-[92svh] w-full max-w-2xl overflow-y-auto rounded-t-lg border border-[#E5E7EB] bg-white p-4 shadow-xl sm:rounded-lg sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Cập nhật gửi giữ</h2>
              <button
                aria-label="Đóng"
                className={iconButton}
                onClick={() => setEditingDeposit(null)}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>

            <form className="grid gap-3 sm:grid-cols-2 sm:gap-4" onSubmit={handleUpdateDeposit}>
              {isAdmin ? (
                <>
                  <label>
                    <span className={labelClass}>Họ và tên</span>
                    <input
                      className={inputClass}
                      value={editForm.fullName}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          fullName: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Số điện thoại</span>
                    <input
                      className={inputClass}
                      inputMode="tel"
                      value={editForm.phone}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Ngày gửi</span>
                    <input
                      className={inputClass}
                      type="date"
                      value={editForm.depositDate}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          depositDate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Giờ gửi</span>
                    <input
                      className={inputClass}
                      type="time"
                      value={editForm.depositTime}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          depositTime: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}

              <label>
                <span className={labelClass}>Thẻ còn lại</span>
                <input
                  className={inputClass}
                  min="0"
                  type="number"
                  value={editForm.cards}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      cards: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Bi còn lại</span>
                <input
                  className={inputClass}
                  min="0"
                  type="number"
                  value={editForm.balls}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      balls: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="sm:col-span-2">
                <span className={labelClass}>Trạng thái</span>
                <select
                  className={selectClass}
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      status: event.target.value as Status,
                    }))
                  }
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:flex sm:justify-end">
                <button
                  className={`${secondaryButton} w-full sm:w-auto`}
                  onClick={() => setEditingDeposit(null)}
                  type="button"
                >
                  Hủy
                </button>
                <button className={`${primaryButton} w-full sm:w-auto`} type="submit">
                  <Save aria-hidden="true" size={18} />
                  Lưu cập nhật
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
