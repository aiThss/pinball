"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";

async function postLogin(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? "Không đăng nhập được.");
  }

  return data;
}

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await postLogin(username, password);
      window.location.href = "/";
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Không đăng nhập được.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1020] px-4 py-10 text-slate-50">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-[#111827] p-6 shadow-2xl shadow-black/30">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-300 text-slate-950">
            <LockKeyhole aria-hidden="true" size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-normal">Pinball Baby Ress</h1>
            <p className="text-sm text-slate-300">Quản lý gửi giữ thẻ và bi</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Tài khoản</span>
            <input
              autoComplete="username"
              className="h-14 w-full rounded-md border border-slate-600 bg-slate-950 px-4 text-lg text-white outline-none ring-yellow-300 transition focus:border-yellow-300 focus:ring-2"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Mật khẩu</span>
            <input
              autoComplete="current-password"
              className="h-14 w-full rounded-md border border-slate-600 bg-slate-950 px-4 text-lg text-white outline-none ring-yellow-300 transition focus:border-yellow-300 focus:ring-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? (
            <div className="rounded-md border border-red-400/50 bg-red-950/60 px-4 py-3 text-sm font-medium text-red-100">
              {error}
            </div>
          ) : null}

          <button
            className="flex h-14 w-full items-center justify-center gap-2 rounded-md bg-yellow-300 px-5 text-lg font-bold text-slate-950 transition hover:bg-yellow-200 disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            <LogIn aria-hidden="true" size={22} />
            {submitting ? "Đang vào..." : "Đăng nhập"}
          </button>
        </form>
      </section>
    </main>
  );
}
