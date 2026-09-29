import { useEffect, useMemo, useState } from "react";
import { FiEye, FiEyeOff, FiLock, FiUser } from "react-icons/fi";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

function AnalogClock({ date }) {
  const seconds = date.getSeconds();
  const minutes = date.getMinutes();
  const hours = date.getHours() % 12;

  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = hours * 30 + minutes * 0.5;

  return (
    <div className="relative mx-auto size-48 rounded-full border border-white/80 bg-white/55 shadow-[0_24px_55px_rgba(15,23,42,.14)] backdrop-blur-xl sm:size-52">
      {Array.from({ length: 60 }).map((_, index) => {
        const isHour = index % 5 === 0;
        return (
          <span
            key={index}
            className={`absolute left-1/2 top-2 origin-[50%_96px] -translate-x-1/2 rounded-full bg-slate-700 ${isHour ? "h-3 w-0.5" : "h-1.5 w-px opacity-60"}`}
            style={{ transform: `translateX(-50%) rotate(${index * 6}deg)` }}
          />
        );
      })}

      <span
        className="absolute bottom-1/2 left-1/2 h-[30%] w-1 origin-bottom -translate-x-1/2 rounded-full bg-slate-900"
        style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }}
      />
      <span
        className="absolute bottom-1/2 left-1/2 h-[38%] w-0.5 origin-bottom -translate-x-1/2 rounded-full bg-slate-800"
        style={{ transform: `translateX(-50%) rotate(${minuteDeg}deg)` }}
      />
      <span
        className="absolute bottom-1/2 left-1/2 h-[41%] w-px origin-bottom -translate-x-1/2 bg-blue-500"
        style={{ transform: `translateX(-50%) rotate(${secondDeg}deg)` }}
      />
      <span className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-slate-300 bg-slate-900 shadow" />
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login, loading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [form, setForm] = useState({ identifier: "", login_code: "", remember: true });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour < 12) return "Good Morning!";
    if (hour < 17) return "Good Afternoon!";
    return "Good Evening!";
  }, [now]);

  const dayName = now.toLocaleDateString("en-GB", { weekday: "long" });
  const dateText = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (isAuthenticated) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (!form.identifier.trim() || !form.login_code) {
      toast.error("نوم / Email او Login Code ولیکئ.");
      return;
    }

    try {
      await login(form.identifier.trim(), form.login_code, form.remember);
      toast.success("په بریالیتوب سره داخل شوئ.");
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (error) {
      toast.error(error?.message || "د ننوتلو معلومات ناسم دي.");
    }
  };

  const submitForgot = async (event) => {
    event.preventDefault();
    setForgotLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    toast.success("د Login Code د Reset لپاره له Administrator سره اړیکه ونیسئ.");
    setForgotOpen(false);
    setForgotEmail("");
    setForgotLoading(false);
  };

  return (
    <main className="login-background min-h-screen p-3 sm:p-6 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1040px] items-center justify-center sm:min-h-[calc(100vh-48px)]">
        <div className="grid w-full gap-5 lg:grid-cols-[1.08fr_.92fr]">
          <section className="rounded-[34px] border border-white/75 bg-white/45 p-5 shadow-[0_28px_80px_rgba(15,23,42,.20)] backdrop-blur-2xl sm:p-8">
            <form onSubmit={submit} className="mx-auto w-full max-w-md">
              <div className="text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-blue-700 text-3xl font-black text-white shadow-xl shadow-blue-600/25">
                  W
                </div>
                <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950">
                  WMS <span className="text-blue-600">PRO</span>
                </h1>
                <p className="mt-2 text-sm font-semibold text-slate-600">Warehouse Management System</p>
                <div className="mx-auto mt-5 h-1 w-20 rounded-full bg-blue-600" />
                <h2 className="mt-7 text-2xl font-black text-slate-900">ښه راغلاست</h2>
                <p className="mt-2 text-sm text-slate-600">خپل حساب ته ننوځئ</p>
              </div>

              <div className="mt-7 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-right text-sm font-black text-slate-800">نوم، Email یا Username</span>
                  <div className="relative">
                    <FiUser className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      className="h-14 w-full rounded-2xl border border-white/80 bg-white/70 px-12 text-sm text-slate-900 outline-none shadow-sm backdrop-blur transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                      value={form.identifier}
                      onChange={(event) => setForm({ ...form, identifier: event.target.value })}
                      autoComplete="username"
                      placeholder="admin یا admin@local.test"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-right text-sm font-black text-slate-800">Login Code</span>
                  <div className="relative">
                    <FiLock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      className="h-14 w-full rounded-2xl border border-white/80 bg-white/70 px-12 text-sm text-slate-900 outline-none shadow-sm backdrop-blur transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                      value={form.login_code}
                      onChange={(event) => setForm({ ...form, login_code: event.target.value })}
                      autoComplete="one-time-code"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="absolute left-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-600 transition hover:bg-white/70"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label="Show password"
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </label>

                <div className="flex items-center justify-between gap-4 text-sm">
                  <label className="flex items-center gap-2 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.remember}
                      onChange={(event) => setForm({ ...form, remember: event.target.checked })}
                      className="size-4 accent-blue-600"
                    />
                    ما په یاد وساته
                  </label>
                  <button
                    type="button"
                    className="font-extrabold text-blue-700 transition hover:text-blue-900"
                    onClick={() => setForgotOpen(true)}
                  >
                    Login Code هېر شوی؟
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-blue-700 text-base font-black text-white shadow-[0_16px_34px_rgba(37,99,235,.28)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(37,99,235,.34)] disabled:pointer-events-none disabled:opacity-60"
                >
                  {loading ? "داخلېږي..." : "ننوتل"}
                </button>
              </div>

              <div className="mt-7 border-t border-white/60 pt-5 text-center text-xs text-slate-700">
                <p>Software Engineering developer</p>
                <p className="mt-2 text-sm font-black text-blue-700">Aziz ullah Niazi</p>
                <p className="mt-2">© 2026 All rights reserved</p>
              </div>
            </form>
          </section>

          <section className="hidden rounded-[34px] border border-white/75 bg-white/45 p-8 shadow-[0_28px_80px_rgba(15,23,42,.18)] backdrop-blur-2xl lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="text-lg font-black text-slate-900">{greeting} ☀️</p>
              <h2 className="mt-10 text-4xl font-black text-slate-950">{dayName}</h2>
              <p className="mt-3 text-2xl font-bold text-slate-900">{dateText}</p>
            </div>

            <AnalogClock date={now} />

            <div>
              <p className="text-xl font-black leading-8 text-slate-900">“Discipline today.<br />Success tomorrow.”</p>
              <div className="mt-10 text-center text-5xl text-blue-600">♥</div>
            </div>
          </section>
        </div>
      </div>

      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="Login Code Reset" size="sm">
        <form onSubmit={submitForgot} className="space-y-4">
          <p className="text-sm leading-6 text-slate-500">خپل Email ولیکئ. Login Code یوازې Administrator بدلولی شي.</p>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">Email</span>
            <input
              type="email"
              className="field"
              value={forgotEmail}
              onChange={(event) => setForgotEmail(event.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <Button type="submit" className="w-full" disabled={forgotLoading}>
            {forgotLoading ? "کتل کېږي..." : "Administrator ته مراجعه"}
          </Button>
        </form>
      </Modal>
    </main>
  );
}
