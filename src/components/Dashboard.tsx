"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ClipboardList,
  Edit3,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

type Role = "admin" | "staff";
type Status = "Đang gửi" | "Đã nhận lại" | "Đã đổi quà" | "Đã hủy";

type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
};

type UserRow = AuthUser & {
  createdAt?: string;
  updatedAt?: string;
};

type UserRef = {
  id: string;
  username: string;
  displayName: string;
  role: string;
} | null;

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
  createdBy: UserRef;
  updatedBy: UserRef;
  history: HistoryEntry[];
};

type Notice = {
  type: "success" | "error";
  text: string;
};

const statuses: Status[] = ["Đang gửi", "Đã nhận lại", "Đã đổi quà", "Đã hủy"];

const inputClass =
  "h-12 w-full rounded-md border border-slate-600 bg-slate-950 px-3 text-base text-white outline-none ring-yellow-300 transition placeholder:text-slate-500 focus:border-yellow-300 focus:ring-2";
const selectClass =
  "h-12 w-full rounded-md border border-slate-600 bg-slate-950 px-3 text-base text-white outline-none ring-yellow-300 transition focus:border-yellow-300 focus:ring-2";
const labelClass = "mb-1.5 block text-sm font-semibold text-slate-200";
const primaryButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md bg-yellow-300 px-5 text-base font-bold text-slate-950 transition hover:bg-yellow-200 disabled:opacity-60";
const secondaryButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md border border-slate-500 bg-slate-800 px-4 text-base font-semibold text-slate-50 transition hover:bg-slate-700 disabled:opacity-60";
const dangerButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md border border-red-400/70 bg-red-950 px-4 text-base font-semibold text-red-50 transition hover:bg-red-900 disabled:opacity-60";

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
    return "border-sky-300 bg-sky-950 text-sky-100";
  }

  if (status === "Đã nhận lại") {
    return "border-emerald-300 bg-emerald-950 text-emerald-100";
  }

  if (status === "Đã đổi quà") {
    return "border-fuchsia-300 bg-fuchsia-950 text-fuchsia-100";
  }

  return "border-slate-400 bg-slate-800 text-slate-100";
}

async function apiRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? "Có lỗi xảy ra.");
  }

  return data as T;
}

export default function Dashboard({ user }: { user: AuthUser }) {
  const isAdmin = user.role === "admin";
  const [activeTab, setActiveTab] = useState<"deposits" | "employees">("deposits");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
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
    depositDate: "",
    depositTime: "",
    cards: "0",
    balls: "0",
    status: "Đang gửi" as Status,
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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userDrafts, setUserDrafts] = useState<
    Record<string, { displayName: string; role: Role; isActive: boolean; password: string }>
  >({});
  const [newUser, setNewUser] = useState({
    displayName: "",
    username: "",
    password: "",
    role: "staff" as Role,
  });

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

  const loadHanoiTime = useCallback(async () => {
    try {
      const data = await apiRequest<{ date: string; time: string }>("/api/time");
      setDepositForm((current) => ({
        ...current,
        depositDate: data.date,
        depositTime: data.time,
      }));
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không lấy được giờ Hà Nội.");
    }
  }, [showNotice]);

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

      if (filters.date) {
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
  }, [filters, showNotice]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    try {
      const data = await apiRequest<{ users: UserRow[] }>("/api/users");
      setUsers(data.users);
      setUserDrafts(
        Object.fromEntries(
          data.users.map((staff) => [
            staff.id,
            {
              displayName: staff.displayName,
              role: staff.role,
              isActive: staff.isActive,
              password: "",
            },
          ]),
        ),
      );
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không tải được nhân viên.");
    }
  }, [isAdmin, showNotice]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHanoiTime();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadHanoiTime]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDeposits();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDeposits]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (activeTab === "employees") {
        void loadUsers();
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, loadUsers]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
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
          cards: Number(depositForm.cards),
          balls: Number(depositForm.balls),
        }),
      });

      setDeposits((current) => [data.deposit, ...current]);
      setDepositForm((current) => ({
        ...current,
        fullName: "",
        phone: "",
        cards: "0",
        balls: "0",
        status: "Đang gửi",
      }));
      showNotice("success", "Đã lưu bản ghi gửi giữ.");
      void loadHanoiTime();
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
          cards: Number(editForm.cards),
          balls: Number(editForm.balls),
        }
      : {
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

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const data = await apiRequest<{ user: UserRow }>("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newUser),
      });
      setUsers((current) => [data.user, ...current]);
      setUserDrafts((current) => ({
        ...current,
        [data.user.id]: {
          displayName: data.user.displayName,
          role: data.user.role,
          isActive: data.user.isActive,
          password: "",
        },
      }));
      setNewUser({ displayName: "", username: "", password: "", role: "staff" });
      showNotice("success", "Đã tạo nhân viên.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không tạo được nhân viên.");
    }
  }

  async function handleSaveUser(staff: UserRow) {
    const draft = userDrafts[staff.id];

    if (!draft) {
      return;
    }

    const payload: Record<string, unknown> = {
      displayName: draft.displayName,
      role: draft.role,
      isActive: draft.isActive,
    };

    if (draft.password.trim()) {
      payload.password = draft.password.trim();
    }

    try {
      const data = await apiRequest<{ user: UserRow }>(`/api/users/${staff.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      setUsers((current) =>
        current.map((item) => (item.id === data.user.id ? data.user : item)),
      );
      setUserDrafts((current) => ({
        ...current,
        [data.user.id]: {
          displayName: data.user.displayName,
          role: data.user.role,
          isActive: data.user.isActive,
          password: "",
        },
      }));
      showNotice("success", "Đã lưu nhân viên.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không lưu được nhân viên.");
    }
  }

  async function handleDeleteUser(staff: UserRow) {
    const confirmed = window.confirm(`Xóa tài khoản ${staff.username}?`);

    if (!confirmed) {
      return;
    }

    try {
      await apiRequest<{ ok: boolean }>(`/api/users/${staff.id}`, {
        method: "DELETE",
      });
      setUsers((current) => current.filter((item) => item.id !== staff.id));
      showNotice("success", "Đã xóa nhân viên.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không xóa được nhân viên.");
    }
  }

  return (
    <main className="min-h-screen bg-[#0b1020] text-slate-50">
      <header className="border-b border-white/10 bg-[#111827] px-4 py-4 shadow-lg shadow-black/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-300 text-slate-950">
              <ClipboardList aria-hidden="true" size={25} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-normal md:text-2xl">Pinball Deposit</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span>{user.displayName}</span>
                <span className="rounded border border-cyan-300/60 px-2 py-0.5 text-cyan-100">
                  {user.role === "admin" ? "Admin" : "Staff"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={activeTab === "deposits" ? primaryButton : secondaryButton}
              onClick={() => setActiveTab("deposits")}
              type="button"
            >
              <ClipboardList aria-hidden="true" size={20} />
              Gửi giữ
            </button>
            {isAdmin ? (
              <button
                className={activeTab === "employees" ? primaryButton : secondaryButton}
                onClick={() => setActiveTab("employees")}
                type="button"
              >
                <Users aria-hidden="true" size={20} />
                Nhân viên
              </button>
            ) : null}
            <button className={secondaryButton} onClick={handleLogout} type="button">
              <LogOut aria-hidden="true" size={20} />
              Thoát
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {notice ? (
          <div
            className={`mb-4 flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm font-semibold ${
              notice.type === "success"
                ? "border-emerald-400/60 bg-emerald-950/80 text-emerald-50"
                : "border-red-400/60 bg-red-950/80 text-red-50"
            }`}
          >
            <span>{notice.text}</span>
            <button
              aria-label="Đóng thông báo"
              className="rounded p-1 hover:bg-white/10"
              onClick={() => setNotice(null)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        ) : null}

        {activeTab === "deposits" ? (
          <div className="space-y-5">
            <section className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-white/10 bg-[#111827] p-4">
                <div className="text-sm font-semibold text-slate-300">Đang gửi</div>
                <div className="mt-1 text-3xl font-bold text-white">{activeDeposits}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-[#111827] p-4">
                <div className="text-sm font-semibold text-slate-300">Tổng thẻ còn giữ</div>
                <div className="mt-1 text-3xl font-bold text-yellow-200">{totalCards}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-[#111827] p-4">
                <div className="text-sm font-semibold text-slate-300">Tổng bi còn giữ</div>
                <div className="mt-1 text-3xl font-bold text-cyan-100">{totalBalls}</div>
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#111827] p-4 shadow-xl shadow-black/20">
              <h2 className="mb-4 text-lg font-bold">Nhập gửi giữ</h2>
              <form className="grid gap-4 lg:grid-cols-12" onSubmit={handleCreateDeposit}>
                <label className="lg:col-span-3">
                  <span className={labelClass}>Họ và tên khách</span>
                  <input
                    className={inputClass}
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

                <label className="lg:col-span-2">
                  <span className={labelClass}>Số điện thoại</span>
                  <input
                    className={inputClass}
                    inputMode="tel"
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
                  />
                </label>

                <label className="lg:col-span-1">
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
                  />
                </label>

                <label className="lg:col-span-1">
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

                <label className="lg:col-span-1">
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

                <div className="flex items-end lg:col-span-2">
                  <button className="h-12 w-full justify-center rounded-md bg-yellow-300 px-5 text-base font-bold text-slate-950 transition hover:bg-yellow-200" type="submit">
                    <span className="inline-flex items-center gap-2">
                      <Plus aria-hidden="true" size={20} />
                      Lưu
                    </span>
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#111827] p-4 shadow-xl shadow-black/20">
              <form
                className="grid gap-3 lg:grid-cols-12"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadDeposits();
                }}
              >
                <label className="lg:col-span-3">
                  <span className={labelClass}>Tìm theo họ tên</span>
                  <input
                    className={inputClass}
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
                    value={filters.phone}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </label>
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
                <label className="lg:col-span-2">
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
                    <Search aria-hidden="true" size={20} />
                    Tìm
                  </button>
                  <button
                    className={secondaryButton}
                    onClick={() => {
                      setFilters({ name: "", phone: "", date: "", status: "" });
                    }}
                    type="button"
                  >
                    <RefreshCw aria-hidden="true" size={20} />
                    Xóa lọc
                  </button>
                </div>
              </form>
            </section>

            <section className="overflow-hidden rounded-lg border border-white/10 bg-[#111827] shadow-xl shadow-black/20">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="text-lg font-bold">Danh sách gửi giữ</h2>
                <button className={secondaryButton} onClick={() => void loadDeposits()} type="button">
                  <RefreshCw aria-hidden="true" size={20} />
                  {loading ? "Đang tải" : "Tải lại"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-950 text-xs uppercase text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Họ và tên</th>
                      <th className="px-4 py-3">SĐT</th>
                      <th className="px-4 py-3">Ngày gửi</th>
                      <th className="px-4 py-3">Giờ gửi</th>
                      <th className="px-4 py-3 text-right">Thẻ</th>
                      <th className="px-4 py-3 text-right">Bi</th>
                      <th className="px-4 py-3">Tổng</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Nhân viên</th>
                      <th className="px-4 py-3">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {deposits.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-slate-300" colSpan={10}>
                          Không có bản ghi.
                        </td>
                      </tr>
                    ) : null}

                    {deposits.map((deposit) => (
                      <Fragment key={deposit.id}>
                        <tr className="align-top hover:bg-white/[0.03]">
                          <td className="px-4 py-3 font-semibold text-white">{deposit.fullName}</td>
                          <td className="px-4 py-3 text-slate-100">{deposit.phone}</td>
                          <td className="px-4 py-3 text-slate-100">
                            {formatDate(deposit.depositDate)}
                          </td>
                          <td className="px-4 py-3 text-slate-100">{deposit.depositTime}</td>
                          <td className="px-4 py-3 text-right font-bold text-yellow-100">
                            {deposit.cards}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-cyan-100">
                            {deposit.balls}
                          </td>
                          <td className="px-4 py-3 text-slate-100">{deposit.totalText}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded border px-2 py-1 text-xs font-bold ${statusClass(
                                deposit.status,
                              )}`}
                            >
                              {deposit.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            <div>{deposit.createdBy?.displayName ?? "N/A"}</div>
                            <div className="text-xs">Sửa: {deposit.updatedBy?.displayName ?? "N/A"}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="inline-flex h-10 items-center gap-1 rounded-md border border-slate-500 bg-slate-800 px-3 font-semibold hover:bg-slate-700"
                                onClick={() => openEdit(deposit)}
                                type="button"
                              >
                                <Edit3 aria-hidden="true" size={16} />
                                Sửa
                              </button>
                              <button
                                className="inline-flex h-10 items-center gap-1 rounded-md border border-slate-500 bg-slate-800 px-3 font-semibold hover:bg-slate-700"
                                onClick={() =>
                                  setExpandedHistoryId((current) =>
                                    current === deposit.id ? null : deposit.id,
                                  )
                                }
                                type="button"
                              >
                                <Calendar aria-hidden="true" size={16} />
                                Lịch sử
                              </button>
                              {isAdmin ? (
                                <button
                                  className="inline-flex h-10 items-center gap-1 rounded-md border border-red-400/70 bg-red-950 px-3 font-semibold text-red-50 hover:bg-red-900"
                                  onClick={() => void handleDeleteDeposit(deposit)}
                                  type="button"
                                >
                                  <Trash2 aria-hidden="true" size={16} />
                                  Xóa
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {expandedHistoryId === deposit.id ? (
                          <tr className="bg-slate-950/70">
                            <td className="px-4 py-4" colSpan={10}>
                              <div className="space-y-2">
                                {deposit.history.map((entry) => (
                                  <div
                                    className="rounded-md border border-white/10 bg-[#111827] px-3 py-2"
                                    key={entry.id || `${entry.at}-${entry.content}`}
                                  >
                                    <div className="text-xs font-semibold text-slate-400">
                                      {formatDateTime(entry.at)} · {entry.actorName} · {entry.action}
                                    </div>
                                    <div className="mt-1 text-sm text-slate-100">{entry.content}</div>
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
          </div>
        ) : (
          <section className="rounded-lg border border-white/10 bg-[#111827] p-4 shadow-xl shadow-black/20">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="text-yellow-200" size={24} />
              <h2 className="text-lg font-bold">Quản lý nhân viên</h2>
            </div>

            <form className="mb-6 grid gap-3 lg:grid-cols-12" onSubmit={handleCreateUser}>
              <label className="lg:col-span-3">
                <span className={labelClass}>Tên nhân viên</span>
                <input
                  className={inputClass}
                  value={newUser.displayName}
                  onChange={(event) =>
                    setNewUser((current) => ({ ...current, displayName: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="lg:col-span-3">
                <span className={labelClass}>Tài khoản</span>
                <input
                  className={inputClass}
                  value={newUser.username}
                  onChange={(event) =>
                    setNewUser((current) => ({ ...current, username: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="lg:col-span-3">
                <span className={labelClass}>Mật khẩu</span>
                <input
                  className={inputClass}
                  type="password"
                  value={newUser.password}
                  onChange={(event) =>
                    setNewUser((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="lg:col-span-1">
                <span className={labelClass}>Role</span>
                <select
                  className={selectClass}
                  value={newUser.role}
                  onChange={(event) =>
                    setNewUser((current) => ({ ...current, role: event.target.value as Role }))
                  }
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <div className="flex items-end lg:col-span-2">
                <button className={`${primaryButton} w-full`} type="submit">
                  <Plus aria-hidden="true" size={20} />
                  Tạo
                </button>
              </div>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Tên</th>
                    <th className="px-4 py-3">Tài khoản</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Mật khẩu mới</th>
                    <th className="px-4 py-3">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {users.map((staff) => {
                    const draft = userDrafts[staff.id];

                    return (
                      <tr key={staff.id}>
                        <td className="px-4 py-3">
                          <input
                            className={inputClass}
                            value={draft?.displayName ?? staff.displayName}
                            onChange={(event) =>
                              setUserDrafts((current) => ({
                                ...current,
                                [staff.id]: {
                                  displayName: event.target.value,
                                  role: draft?.role ?? staff.role,
                                  isActive: draft?.isActive ?? staff.isActive,
                                  password: draft?.password ?? "",
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">{staff.username}</td>
                        <td className="px-4 py-3">
                          <select
                            className={selectClass}
                            value={draft?.role ?? staff.role}
                            onChange={(event) =>
                              setUserDrafts((current) => ({
                                ...current,
                                [staff.id]: {
                                  displayName: draft?.displayName ?? staff.displayName,
                                  role: event.target.value as Role,
                                  isActive: draft?.isActive ?? staff.isActive,
                                  password: draft?.password ?? "",
                                },
                              }))
                            }
                          >
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            className={selectClass}
                            value={String(draft?.isActive ?? staff.isActive)}
                            onChange={(event) =>
                              setUserDrafts((current) => ({
                                ...current,
                                [staff.id]: {
                                  displayName: draft?.displayName ?? staff.displayName,
                                  role: draft?.role ?? staff.role,
                                  isActive: event.target.value === "true",
                                  password: draft?.password ?? "",
                                },
                              }))
                            }
                          >
                            <option value="true">Hoạt động</option>
                            <option value="false">Khóa</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            className={inputClass}
                            type="password"
                            value={draft?.password ?? ""}
                            onChange={(event) =>
                              setUserDrafts((current) => ({
                                ...current,
                                [staff.id]: {
                                  displayName: draft?.displayName ?? staff.displayName,
                                  role: draft?.role ?? staff.role,
                                  isActive: draft?.isActive ?? staff.isActive,
                                  password: event.target.value,
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className={secondaryButton}
                              onClick={() => void handleSaveUser(staff)}
                              type="button"
                            >
                              <Save aria-hidden="true" size={18} />
                              Lưu
                            </button>
                            {staff.id !== user.id ? (
                              <button
                                className={dangerButton}
                                onClick={() => void handleDeleteUser(staff)}
                                type="button"
                              >
                                <Trash2 aria-hidden="true" size={18} />
                                Xóa
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {editingDeposit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-[#111827] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Cập nhật gửi giữ</h2>
              <button
                aria-label="Đóng"
                className="rounded-md border border-slate-500 bg-slate-800 p-2 hover:bg-slate-700"
                onClick={() => setEditingDeposit(null)}
                type="button"
              >
                <X aria-hidden="true" size={22} />
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
                  <Save aria-hidden="true" size={20} />
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
