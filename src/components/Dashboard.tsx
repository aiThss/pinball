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

type Mode = "staff" | "admin";
type Status = "Đang gửi" | "Đã nhận lại" | "Đã đổi quà" | "Đã hủy";

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

const statuses: Status[] = ["Đang gửi", "Đã nhận lại", "Đã đổi quà", "Đã hủy"];
const staffStorageKey = "pinball_staff_name";

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

function getHanoiParts(date = new Date()) {
  const hanoiDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const iso = hanoiDate.toISOString();

  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
    shortTime: iso.slice(11, 16),
  };
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

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

function actorName(deposit: Deposit, field: "created" | "updated") {
  if (field === "created") {
    return deposit.createdByName || deposit.createdBy?.displayName || "N/A";
  }

  return deposit.updatedByName || deposit.updatedBy?.displayName || "N/A";
}

async function apiRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? "Có lỗi xảy ra.");
  }

  return data as T;
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
            <h1 className="text-2xl font-bold">Pinball Deposit</h1>
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
  const [staffName, setStaffName] = useState(isAdmin ? "Admin" : "");
  const [clock, setClock] = useState(getHanoiParts());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [filters, setFilters] = useState({
    name: "",
    phone: "",
    date: "",
    status: "",
  });
  const [depositForm, setDepositForm] = useState({
    fullName: "",
    phone: "",
    cards: "0",
    balls: "0",
  });
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
    const intervalId = window.setInterval(() => setClock(getHanoiParts()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const activeDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.status === "Đang gửi").length,
    [deposits],
  );

  const totalCards = useMemo(
    () =>
      deposits
        .filter((deposit) => deposit.status === "Đang gửi")
        .reduce((sum, deposit) => sum + deposit.cards, 0),
    [deposits],
  );

  const totalBalls = useMemo(
    () =>
      deposits
        .filter((deposit) => deposit.status === "Đang gửi")
        .reduce((sum, deposit) => sum + deposit.balls, 0),
    [deposits],
  );

  const showNotice = useCallback((type: Notice["type"], text: string) => {
    setNotice({ type, text });
  }, []);

  const loadDeposits = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (filters.name.trim()) {
        params.set("name", filters.name.trim());
      }

      if (filters.phone.trim()) {
        params.set("phone", filters.phone.trim());
      }

      if (isAdmin && filters.date) {
        params.set("date", filters.date);
      }

      if (filters.status) {
        params.set("status", filters.status);
      }

      const query = params.toString();
      const data = await apiRequest<{ deposits: Deposit[] }>(
        `/api/deposits${query ? `?${query}` : ""}`,
      );
      setDeposits(data.deposits);
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [filters, isAdmin, showNotice]);

  useEffect(() => {
    if (!staffName) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadDeposits();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDeposits, staffName]);

  if (!staffName) {
    return <StaffGate onEnter={setStaffName} />;
  }

  async function handleCreateDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const data = await apiRequest<{ deposit: Deposit }>("/api/deposits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...depositForm,
          actorName: staffName,
          cards: Number(depositForm.cards),
          balls: Number(depositForm.balls),
        }),
      });

      setDeposits((current) => [data.deposit, ...current]);
      setDepositForm({
        fullName: "",
        phone: "",
        cards: "0",
        balls: "0",
      });
      showNotice("success", "Đã lưu bản ghi gửi giữ.");
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
      showNotice("success", "Đã xóa bản ghi.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không xóa được.");
    }
  }

  function switchStaff() {
    localStorage.removeItem(staffStorageKey);
    setStaffName("");
  }

  async function handleExportExcel() {
    if (deposits.length === 0) {
      showNotice("error", "Không có dữ liệu để xuất Excel.");
      return;
    }

    setExporting(true);

    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const exportedAt = getHanoiParts();
      const titleCell: Cell = {
        value: "Pinball Deposit - Danh sách gửi giữ",
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
      const depositRows = deposits.map((deposit, index) => [
        index + 1,
        deposit.fullName,
        deposit.phone,
        formatDate(deposit.depositDate),
        deposit.depositTime,
        deposit.cards,
        deposit.balls,
        deposit.totalText,
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
        const historyRows = deposits.flatMap((deposit) =>
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
                value: "Pinball Deposit - Lịch sử cập nhật",
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
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex">
              <LayoutDashboard aria-hidden="true" className="text-[#334155]" size={22} />
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#111827] text-white">
              <Ticket aria-hidden="true" size={23} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Pinball Deposit</h1>
              <p className="text-sm text-[#64748B]">Quản lý gửi bi & thẻ</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right text-sm font-semibold">
              <div>{clock.time}</div>
              <div className="font-normal text-[#64748B]">{formatDate(clock.date)}</div>
            </div>
            <div className="h-10 w-px bg-[#E5E7EB]" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E5E7EB] text-sm font-semibold">
                {staffName
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold">{staffName}</div>
                <div className="text-xs text-[#64748B]">{isAdmin ? "Admin" : "Nhân viên"}</div>
              </div>
              {!isAdmin ? (
                <button
                  aria-label="Đổi nhân viên"
                  className={iconButton}
                  onClick={switchStaff}
                  type="button"
                >
                  <LogOut aria-hidden="true" size={17} />
                </button>
              ) : null}
            </div>
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

        <section className="space-y-5 px-4 py-5 lg:px-6">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link className={isAdmin ? secondaryButton : primaryButton} href="/">
              <Ticket aria-hidden="true" size={18} />
              Gửi giữ
            </Link>
            <Link className={isAdmin ? primaryButton : secondaryButton} href="/admin">
              <Eye aria-hidden="true" size={18} />
              Admin
            </Link>
          </div>

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

          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F5F9]">
                  <Ticket aria-hidden="true" size={24} />
                </div>
                <div>
                  <div className="text-sm text-[#334155]">Đang gửi</div>
                  <div className="text-3xl font-bold">{activeDeposits}</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F5F9]">
                  <CalendarDays aria-hidden="true" size={24} />
                </div>
                <div>
                  <div className="text-sm text-[#334155]">Tổng thẻ còn giữ</div>
                  <div className="text-3xl font-bold">{totalCards}</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F5F9]">
                  <Coins aria-hidden="true" size={24} />
                </div>
                <div>
                  <div className="text-sm text-[#334155]">Tổng bi còn giữ</div>
                  <div className="text-3xl font-bold">{totalBalls}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">Nhập gửi giữ</h2>
            <form className="grid gap-4 lg:grid-cols-12" onSubmit={handleCreateDeposit}>
              <label className="lg:col-span-4">
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

              <label className="lg:col-span-3">
                <span className={labelClass}>Số điện thoại</span>
                <input
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
              </label>

              <label className="lg:col-span-2">
                <span className={labelClass}>Thẻ</span>
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
                  className={inputClass}
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

              <div className="flex items-end lg:col-span-1">
                <button className={`${primaryButton} w-full px-3`} type="submit">
                  <Plus aria-hidden="true" size={18} />
                  Lưu
                </button>
              </div>
            </form>
            <p className="mt-3 text-xs text-[#64748B]">
              Ngày và giờ gửi tự đồng bộ theo giờ online UTC+7 khi bấm lưu.
            </p>
          </section>

          <section className="rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <form
              className="grid gap-4 lg:grid-cols-12"
              onSubmit={(event) => {
                event.preventDefault();
                void loadDeposits();
              }}
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
              <label className="lg:col-span-3">
                <span className={labelClass}>Tìm theo SĐT</span>
                <input
                  className={inputClass}
                  inputMode="tel"
                  placeholder="Nhập số điện thoại"
                  value={filters.phone}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>
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
              <label className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}>
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
              <div className="flex flex-col gap-2 sm:flex-row lg:col-span-2 lg:items-end">
                <button className={primaryButton} type="submit">
                  <Search aria-hidden="true" size={18} />
                  Tìm
                </button>
                <button
                  className={secondaryButton}
                  onClick={() => setFilters({ name: "", phone: "", date: "", status: "" })}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={18} />
                  Xóa lọc
                </button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <h2 className="text-lg font-bold">Danh sách gửi giữ</h2>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  className={secondaryButton}
                  disabled={exporting || deposits.length === 0}
                  onClick={() => void handleExportExcel()}
                  type="button"
                >
                  <FileDown aria-hidden="true" size={18} />
                  {exporting ? "Đang xuất" : "Xuất Excel"}
                </button>
                <button className={secondaryButton} onClick={() => void loadDeposits()} type="button">
                  <RefreshCw aria-hidden="true" size={18} />
                  {loading ? "Đang tải" : "Tải lại"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-[#F8FAFC] text-xs font-bold uppercase text-[#334155]">
                  <tr>
                    <th className="px-5 py-3">Họ và tên</th>
                    <th className="px-5 py-3">SĐT</th>
                    {isAdmin ? <th className="px-5 py-3">Ngày gửi</th> : null}
                    {isAdmin ? <th className="px-5 py-3">Giờ gửi</th> : null}
                    <th className="px-5 py-3 text-right">Thẻ</th>
                    <th className="px-5 py-3 text-right">Bi</th>
                    <th className="px-5 py-3">Tổng</th>
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
                        colSpan={isAdmin ? 10 : 8}
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
                            className={`inline-flex rounded-md px-3 py-1 text-xs font-semibold ${statusClass(
                              deposit.status,
                            )}`}
                          >
                            {deposit.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div>{actorName(deposit, "created")}</div>
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
          </section>
        </section>
      </div>

      {editingDeposit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 px-4 py-6">
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-xl">
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

            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleUpdateDeposit}>
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

              <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
                <button className={secondaryButton} onClick={() => setEditingDeposit(null)} type="button">
                  Hủy
                </button>
                <button className={primaryButton} type="submit">
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
