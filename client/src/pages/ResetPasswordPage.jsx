import { useMemo, useState } from "react";
import axios from "axios";
import { FiEye, FiEyeOff, FiLock } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import { getErrorMessage } from "../lib/api";

function readRecoveryToken() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return hash.get("access_token") || query.get("access_token") || "";
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const accessToken = useMemo(readRecoveryToken, []);
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!accessToken) return toast.error("Reset token نشته یا پای ته رسېدلی.");
    if (form.password.length < 8) return toast.error("Password باید لږ تر لږه 8 توري وي.");
    if (form.password !== form.confirm) return toast.error("دواړه Passwordونه یو شان نه دي.");
    setSaving(true);
    try {
      await axios.put(`${import.meta.env.VITE_API_URL || "/api"}/auth/password`, { password: form.password }, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 20000,
      });
      toast.success("Password بدل شو. اوس Login وکړئ.");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, "Password بدل نه شو."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-enter login-background flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="glass-card w-full max-w-md p-6 sm:p-8">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-700 to-sky-500 text-2xl text-white shadow-xl"><FiLock /></div>
        <h1 className="mt-5 text-center text-3xl font-black text-slate-950">نوی Password</h1>
        <p className="mt-2 text-center text-sm text-slate-500">خپل حساب ته یو قوي نوی Password وټاکئ.</p>

        {!accessToken ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">Reset لینک ناسم یا ختم شوی. له Login پاڼې نوی لینک وغواړئ.</div> : null}

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">نوی Password</span>
            <div className="relative">
              <input type={visible ? "text" : "password"} className="field pl-12" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" />
              <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setVisible((value) => !value)}>{visible ? <FiEyeOff /> : <FiEye />}</button>
            </div>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">Password بیا ولیکئ</span>
            <input type={visible ? "text" : "password"} className="field" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} autoComplete="new-password" />
          </label>
          <Button type="submit" className="w-full" disabled={saving || !accessToken}>{saving ? "بدلېږي..." : "Password بدل کړئ"}</Button>
          <Link to="/login" className="secondary-button w-full">Login ته شاته</Link>
        </div>
      </form>
    </main>
  );
}
