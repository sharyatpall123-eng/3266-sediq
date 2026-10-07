import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiCheckCircle,
  FiEye,
  FiGrid,
  FiList,
  FiPhone,
  FiPlus,
  FiDollarSign,
  FiTruck,
  FiUsers,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Loading from "../components/ui/Loading";
import Modal from "../components/ui/Modal";
import SearchInput from "../components/ui/SearchInput";
import { getErrorMessage } from "../lib/api";
import { representativeService } from "../Services/wmsService";
import { formatNumber } from "../utils/format";

const emptyForm = {
  name: "",
  phone: "",
  opening_balance: "",
  opening_balance_note: "",
};

export default function RepresentativesPage() {
  const navigate = useNavigate();
  const initialCompanies = representativeService.peekList({ search: "", limit: 100 });
  const [companies, setCompanies] = useState(() => initialCompanies?.data || []);
  const [loading, setLoading] = useState(() => !initialCompanies);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    if (!representativeService.peekList({ search, limit: 100 })) setLoading(true);

    try {
      const response = await representativeService.list({ search, limit: 100 });
      setCompanies(response.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, "استازي ترلاسه نه شول."));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const delay = search.trim() ? 250 : 0;
    const timer = setTimeout(load, delay);
    return () => clearTimeout(timer);
  }, [load, search]);

  const summary = useMemo(
    () =>
      companies.reduce(
        (acc, item) => {
          acc.total += Number(item.total_goods || 0);
          acc.delivered += Number(item.delivered_goods || 0);
          acc.remaining += Number(item.remaining_goods || 0);

          const deliveries = Array.isArray(item.deliveries) ? item.deliveries : [];
          const companyTransitValue = deliveries.reduce((valueSum, delivery) => {
            const quantity = Math.max(0, Number(delivery.quantity || 0));
            const delivered = Math.min(
              quantity,
              Math.max(0, Number(delivery.delivered_quantity ?? delivery.delivered ?? 0)),
            );
            const remaining = Math.max(0, quantity - delivered);
            const totalPrice = Math.max(
              0,
              Number(delivery.price ?? delivery.goods_price ?? 0),
            );

            if (quantity <= 0 || remaining <= 0 || totalPrice <= 0) {
              return valueSum;
            }

            return valueSum + (totalPrice * remaining) / quantity;
          }, 0);

          acc.transitValue += companyTransitValue;
          if (item.is_active) acc.active += 1;
          return acc;
        },
        { total: 0, delivered: 0, remaining: 0, transitValue: 0, active: 0 },
      ),
    [companies],
  );


  const openDetails = (company) => {
    navigate(`/representatives/${company.id}`);
  };

  const openAccount = (company) => {
    navigate(`/representatives/${company.id}/account`);
  };

  const summaryCards = [
    {
      title: "ټول شرکتونه",
      value: companies.length,
      caption: "ټول ثبت شوي شرکتونه",
      tone: "blue",
      icon: FiUsers,
    },
    {
      title: "لاره کې د مال ارزښت",
      value: Math.round((summary.transitValue + Number.EPSILON) * 100) / 100,
      caption: "د نه تسلیم شوي مال قیمت په چینایي یوان",
      tone: "purple",
      icon: FiDollarSign,
      suffix: " ¥",
    },
    {
      title: "تسلیم شوی",
      value: summary.delivered,
      caption: "په بریالیتوب تسلیم شوی مال",
      tone: "green",
      icon: FiCheckCircle,
    },
    {
      title: "لاره کې مال",
      value: summary.remaining,
      caption: "تر اوسه په لاره کې دی",
      tone: "orange",
      icon: FiTruck,
    },
  ];

  return (
    <div className="page-enter min-w-0 space-y-5">
      <section className="wms-hero-section overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-xl shadow-slate-900/10 sm:rounded-[34px]">
        <div className="wms-photo-hero relative min-h-[178px] overflow-hidden px-5 pb-12 pt-5 text-white sm:min-h-[195px] sm:px-8 sm:pb-14 sm:pt-6 lg:min-h-[205px]" style={{ backgroundImage: "url('/header-images/header-daisy.jpeg')" }}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/70 via-blue-950/40 to-sky-900/20" />

          <div className="relative z-10 flex h-full flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div dir="rtl" className="max-w-[570px] text-right">
              <p className="text-xs font-black tracking-wide text-blue-100 sm:text-sm">
                
              </p>
              <h1 className="mt-1.5 text-3xl font-black tracking-tight sm:text-4xl lg:text-[2.75rem]">
                سوداګریز استازي
              </h1>
              <p className="mt-2 max-w-lg text-sm font-semibold leading-6 text-blue-50 sm:text-base sm:leading-7">
                د بارچلاني او ترانسپورټي استازو، ټول مال، تسلیم او باقي حسابونه په منظم ډول اداره کړئ.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModal("add")}
              className="inline-flex h-11 w-fit items-center justify-center gap-2 self-start rounded-2xl border border-white/80 bg-white px-4 text-sm font-black text-blue-700 shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-blue-50 sm:h-12 sm:px-5 sm:text-base"
            >
              <FiPlus className="text-lg" />
              نوی استازی
            </button>
          </div>
        </div>

        <div className="wms-summary-grid relative z-20 -mt-9 grid grid-cols-2 gap-3 px-3 pb-5 sm:-mt-10 sm:gap-4 sm:px-6 sm:pb-7 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <RepresentativeSummaryCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div dir="rtl" className="text-right">
            <h2 className="text-xl font-black text-slate-950 sm:text-2xl">
              د استازو لیست
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              ټول ثبت شوي بارچلاني او ترانسپورټي شرکتونه
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="w-full sm:w-64 lg:w-72">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="د استازي نوم، نمبر یا ادرس..."
                className="w-full min-w-0"
              />
            </div>

            <div className="flex shrink-0 gap-1.5 self-start rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
              <button
                type="button"
                aria-label="Grid view"
                onClick={() => setView("grid")}
                className={`icon-button ${
                  view === "grid"
                    ? "border-blue-300 bg-blue-600 text-white hover:text-white shadow-md"
                    : "bg-white"
                }`}
              >
                <FiGrid />
              </button>

              <button
                type="button"
                aria-label="List view"
                onClick={() => setView("list")}
                className={`icon-button ${
                  view === "list"
                    ? "border-blue-300 bg-blue-600 text-white hover:text-white shadow-md"
                    : "bg-white"
                }`}
              >
                <FiList />
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-5">
          {loading ? (
            <div className="p-6">
              <Loading />
            </div>
          ) : companies.length === 0 ? (
            <div className="p-6">
              <EmptyState title="استازی نشته" />
            </div>
          ) : view === "grid" ? (
            <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {companies.map((company) => (
                <RepresentativeCard
                  key={company.id}
                  company={company}
                  onView={() => openDetails(company)}
                  onAccount={() => openAccount(company)}
                  onWarmView={() => void representativeService.prefetch(company.id)}
                  onWarmAccount={() => void representativeService.prefetchAccount(company.id)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {companies.map((company) => (
                <RepresentativeListRow
                  key={company.id}
                  company={company}
                  onView={() => openDetails(company)}
                  onAccount={() => openAccount(company)}
                  onWarmView={() => void representativeService.prefetch(company.id)}
                  onWarmAccount={() => void representativeService.prefetchAccount(company.id)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={modal === "add"}
        onClose={() => setModal(null)}
        title="نوی استازی"
        size="sm"
      >
        <CompanyForm
          onCancel={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      </Modal>

    </div>
  );
}

function RepresentativesHeaderArtwork() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.24),transparent_25%),radial-gradient(circle_at_18%_95%,rgba(14,165,233,0.24),transparent_32%)]" />
      <div className="absolute -right-16 -top-20 size-64 rounded-full border border-white/15 bg-white/10 blur-sm" />
      <div className="absolute -bottom-28 -left-20 size-72 rounded-full bg-blue-950/25 blur-3xl" />

      <svg
        viewBox="0 0 800 240"
        className="absolute inset-y-0 left-[-110px] h-full w-[112%] opacity-[0.42] sm:left-0 sm:w-[65%] sm:opacity-95 lg:w-[58%]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="shipHull" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#eff6ff" />
            <stop offset="100%" stopColor="#93c5fd" />
          </linearGradient>
          <linearGradient id="containerBlue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>

        <g opacity="0.3" stroke="#dbeafe" strokeWidth="1.5" fill="none">
          <path d="M30 75L140 32L255 70L370 24L490 68L620 30L770 78" />
          <path d="M35 185L150 145L270 188L385 134L510 181L635 142L770 188" />
          <circle cx="140" cy="32" r="5" fill="#fff" />
          <circle cx="370" cy="24" r="5" fill="#fff" />
          <circle cx="620" cy="30" r="5" fill="#fff" />
        </g>

        <g transform="translate(285 62)">
          <path d="M0 80h260l-32 50H42z" fill="url(#shipHull)" opacity="0.95" />
          <rect x="48" y="30" width="160" height="52" rx="6" fill="#dbeafe" />
          <rect x="65" y="12" width="105" height="24" rx="5" fill="#fff" opacity="0.88" />
          <rect x="178" y="42" width="28" height="38" rx="4" fill="#fff" opacity="0.9" />
          <path d="M193 12v31" stroke="#fff" strokeWidth="5" />
          <path d="M193 16l29 15h-29" fill="#bfdbfe" />
          <circle cx="68" cy="105" r="5" fill="#2563eb" />
          <circle cx="95" cy="105" r="5" fill="#2563eb" />
        </g>

        <g transform="translate(390 42)">
          {[0, 1, 2, 3].map((col) =>
            [0, 1].map((row) => (
              <g key={`${col}-${row}`} transform={`translate(${col * 52} ${row * 38})`}>
                <rect width="46" height="32" rx="4" fill={col % 2 === 0 ? "#f97316" : "#0ea5e9"} opacity="0.92" />
                <path d="M9 0v32M23 0v32M37 0v32" stroke="#fff" strokeOpacity="0.25" />
              </g>
            )),
          )}
        </g>

        <g transform="translate(565 75)">
          <rect x="0" y="34" width="130" height="66" rx="8" fill="url(#containerBlue)" />
          <rect x="12" y="46" width="106" height="42" rx="4" fill="#2563eb" />
          <path d="M28 46v42M54 46v42M80 46v42M106 46v42" stroke="#93c5fd" strokeOpacity="0.55" />
          <path d="M130 53h38l22 24v23h-60z" fill="#eff6ff" />
          <rect x="145" y="61" width="22" height="16" rx="3" fill="#7dd3fc" />
          <circle cx="32" cy="105" r="14" fill="#0f172a" opacity="0.7" />
          <circle cx="145" cy="105" r="14" fill="#0f172a" opacity="0.7" />
          <circle cx="32" cy="105" r="6" fill="#cbd5e1" />
          <circle cx="145" cy="105" r="6" fill="#cbd5e1" />
        </g>

        <g transform="translate(650 135)">
          <rect x="0" y="10" width="56" height="42" rx="5" fill="#f59e0b" />
          <rect x="60" y="0" width="58" height="52" rx="5" fill="#fbbf24" />
          <rect x="122" y="17" width="52" height="35" rx="5" fill="#d97706" />
          <path d="M26 10v42M89 0v52M148 17v35" stroke="#78350f" strokeOpacity="0.25" />
        </g>
      </svg>
    </div>
  );
}

function RepresentativeSummaryCard({ title, value, caption, tone, icon: Icon, suffix = "" }) {
  const tones = {
    blue: {
      icon: "bg-blue-100 text-blue-700",
      border: "border-blue-100",
      caption: "text-blue-600",
    },
    green: {
      icon: "bg-emerald-100 text-emerald-700",
      border: "border-emerald-100",
      caption: "text-emerald-600",
    },
    purple: {
      icon: "bg-violet-100 text-violet-700",
      border: "border-violet-100",
      caption: "text-violet-600",
    },
    orange: {
      icon: "bg-orange-100 text-orange-600",
      border: "border-orange-100",
      caption: "text-orange-600",
    },
  };

  const style = tones[tone] || tones.blue;

  return (
    <article
      className={`wms-summary-card min-w-0 rounded-[22px] border ${style.border} bg-white p-3.5 shadow-[0_18px_38px_rgba(15,23,42,0.14)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(37,99,235,0.18)] sm:rounded-[26px] sm:p-5`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl shadow-sm sm:size-14 sm:text-2xl ${style.icon}`}
        >
          <Icon />
        </span>

        <div dir="rtl" className="min-w-0 flex-1 text-right">
          <p className="truncate text-[12px] font-black text-slate-700 sm:text-sm">
            {title}
          </p>
          <p className="mt-1 truncate text-xl font-black tracking-tight text-slate-950 sm:text-[1.75rem]">
            {formatNumber(value)}{suffix}
          </p>
          <p className={`wms-representative-summary-caption mt-1 truncate text-[11px] font-bold sm:text-xs ${style.caption}`}>
            {caption}
          </p>
        </div>
      </div>
    </article>
  );
}

function RepresentativeCard({ company, onView, onAccount, onWarmView, onWarmAccount }) {
  const total = Number(company.total_goods || 0);
  const delivered = Number(company.delivered_goods || 0);
  const remaining = Number.isFinite(Number(company.remaining_goods))
    ? Number(company.remaining_goods || 0)
    : Math.max(0, total - delivered);

  return (
    <article className="group min-w-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(37,99,235,0.18)]">
      <div className="relative flex h-[118px] items-center justify-center overflow-hidden bg-gradient-to-br from-blue-800 via-blue-600 to-cyan-500 sm:h-[130px]">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.55)_1px,transparent_0)] [background-size:19px_19px]" />
        <div className="absolute -right-12 -top-16 size-40 rounded-full bg-white/10 blur-sm" />
        <div className="relative flex size-20 items-center justify-center rounded-[24px] border border-white/70 bg-white text-4xl text-blue-700 shadow-xl sm:size-24 sm:text-[2.75rem]">
          <FiTruck />
        </div>
      </div>

      <div className="p-4 text-center sm:p-5">
        <h3 className="truncate text-xl font-black text-slate-950 sm:text-[1.35rem]">
          {company.name}
        </h3>

        <p className="mt-1 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500">
          <FiPhone className="text-blue-600" />
          <span>{company.phone || "—"}</span>
        </p>


        <div dir="rtl" className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="جمله مال" value={total} tone="blue" />
          <Metric label="تسلیم شوی" value={delivered} tone="green" />
          <Metric label="لاره کې مال" value={remaining} tone="red" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onView}
            onMouseEnter={onWarmView}
            onFocus={onWarmView}
            onTouchStart={onWarmView}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 text-sm font-black text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100 sm:text-base"
          >
            <span>تفصیلات</span>
            <FiEye />
          </button>

          <button
            type="button"
            onClick={onAccount}
            onMouseEnter={onWarmAccount}
            onFocus={onWarmAccount}
            onTouchStart={onWarmAccount}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-600 to-teal-500 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:from-emerald-700 hover:to-teal-600 sm:text-base"
          >
            <span>حساب</span>
            <FiDollarSign />
          </button>
        </div>
      </div>
    </article>
  );
}

function RepresentativeListRow({ company, onView, onAccount, onWarmView, onWarmAccount }) {
  const total = Number(company.total_goods || 0);
  const delivered = Number(company.delivered_goods || 0);
  const remaining = Number.isFinite(Number(company.remaining_goods))
    ? Number(company.remaining_goods || 0)
    : Math.max(0, total - delivered);

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-lg sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div dir="rtl" className="flex min-w-0 items-center gap-3 text-right">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-700 to-cyan-500 text-2xl text-white shadow-md">
            <FiTruck />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-slate-950">{company.name}</h3>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
              <FiPhone className="text-blue-600" />
              {company.phone || "—"}
            </p>
          </div>
        </div>

        <div dir="rtl" className="grid grid-cols-3 gap-2 lg:w-[390px]">
          <Metric label="جمله مال" value={total} tone="blue" />
          <Metric label="تسلیم شوی" value={delivered} tone="green" />
          <Metric label="لاره کې مال" value={remaining} tone="red" />
        </div>

        <div className="grid grid-cols-2 gap-2 lg:w-[260px]">
          <button
            type="button"
            onClick={onView}
            onMouseEnter={onWarmView}
            onFocus={onWarmView}
            onTouchStart={onWarmView}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 font-black text-blue-700 transition hover:bg-blue-100"
          >
            تفصیلات <FiEye />
          </button>
          <button
            type="button"
            onClick={onAccount}
            onMouseEnter={onWarmAccount}
            onFocus={onWarmAccount}
            onTouchStart={onWarmAccount}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-600 font-black text-white shadow-md shadow-emerald-500/20 transition hover:bg-emerald-700"
          >
            حساب <FiDollarSign />
          </button>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value, tone }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    red: "border-red-100 bg-red-50 text-red-700",
  };

  return (
    <div className={`min-w-0 rounded-2xl border p-2.5 text-center sm:p-3 ${tones[tone]}`}>
      <p className="truncate text-[11px] font-black opacity-80 sm:text-xs">{label}</p>
      <p className="mt-1 truncate text-lg font-black sm:text-xl">{formatNumber(value)}</p>
    </div>
  );
}

function CompanyForm({ onCancel, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name) return toast.error("د استازي نوم ضروري دی.");

    setSaving(true);
    try {
      await representativeService.create({
        name,
        phone: phone || null,
        opening_balance: Math.max(0, Number(form.opening_balance || 0)),
        opening_balance_note: form.opening_balance_note.trim() || null,
      });
      toast.success("استازی اضافه شو.");
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-3 rounded-[20px] border border-blue-100 bg-gradient-to-l from-blue-50 to-cyan-50 p-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-700 to-cyan-500 text-xl text-white shadow-md">
          <FiTruck />
        </span>
        <div className="text-right">
          <h3 className="font-black text-slate-950">نوی استازی</h3>
          <p className="mt-0.5 text-xs font-bold text-slate-500">نوم ضروري دی، موبایل نمبر او پخوانی باقي اختیاري دي.</p>
        </div>
      </div>

      <Field label="د استازي نوم *">
        <input
          autoFocus
          required
          className="field h-11"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="د شرکت یا استازي نوم"
        />
      </Field>

      <Field label="موبایل نمبر">
        <input
          dir="ltr"
          className="field h-11 text-left"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
          placeholder="0700000000 — اختیاري"
        />
      </Field>

      <Field label="پخوانی باقي (USD)">
        <input
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          className="field h-11 text-left"
          value={form.opening_balance}
          onChange={(event) => setForm({ ...form, opening_balance: event.target.value })}
          placeholder="0 — اختیاري"
        />
      </Field>

      <Field label="د پخواني باقي نوټ">
        <textarea
          className="field min-h-20 resize-none"
          value={form.opening_balance_note}
          onChange={(event) => setForm({ ...form, opening_balance_note: event.target.value })}
          placeholder="مثلاً: د پخواني حساب باقي — اختیاري"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
        <Button type="button" variant="secondary" onClick={onCancel}>لغوه</Button>
        <Button type="submit" disabled={saving}>{saving ? "ثبتېږي..." : "ثبت کړه"}</Button>
      </div>
    </form>
  );
}
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      {children}
    </label>
  );
}