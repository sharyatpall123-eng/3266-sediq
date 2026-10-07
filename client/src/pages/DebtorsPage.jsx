import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArchive,
  FiCalendar,
  FiCamera,
  FiClock,
  FiEdit2,
  FiEye,
  FiGrid,
  FiList,
  FiMapPin,
  FiPhone,
  FiPlus,
  FiSave,
  FiUser,
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
import { debtorService } from "../Services/wmsService";
import { useAuth } from "../context/AuthContext";
import { formatDate, formatMoney } from "../utils/format";
import { can } from "../utils/permissions";

const emptyDebtor = {
  name: "",
  phone: "",
  address: "",
  email: "",
  currency: "AFN",
  notes: "",
  openingBalance: "",
  photo: "",
};

async function prepareDebtorPhoto(file) {
  if (!file) return "";

  if (!file.type?.startsWith("image/")) {
    throw new Error("یوازې عکس انتخاب کړئ.");
  }

  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("عکس ونه لوستل شو."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("عکس سم نه دی."));
    img.src = source;
  });

  const maxSize = 420;
  const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.82);
}

const ALERT_DAYS = 10;

function debtorStatus(debtor) {
  return debtor?.debt_status === "bad" ? "bad" : "active";
}

function debtorBalance(debtor) {
  return Number(debtor?.current_balance || debtor?.remaining_balance || 0);
}

function debtorPaid(debtor) {
  return Number(
    debtor?.total_paid ??
      debtor?.totalPaid ??
      debtor?.received_amount ??
      debtor?.paid_amount ??
      0,
  );
}

function debtorReferenceDate(debtor) {
  if (debtor?.last_payment_date) return debtor.last_payment_date;

  const payments = Array.isArray(debtor?.payments) ? debtor.payments : [];
  const paymentDates = payments
    .map((row) => row.payment_date || row.created_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (paymentDates.length) {
    return new Date(Math.max(...paymentDates.map((date) => date.getTime())));
  }

  const invoices = Array.isArray(debtor?.invoices) ? debtor.invoices : [];
  const invoiceDates = invoices
    .map((row) => row.invoice_date || row.date || row.created_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (invoiceDates.length) {
    return new Date(Math.max(...invoiceDates.map((date) => date.getTime())));
  }

  return debtor?.created_at || null;
}

function daysWithoutPayment(debtor) {
  const source = debtorReferenceDate(debtor);
  if (!source) return 0;

  const date = source instanceof Date ? source : new Date(source);
  if (Number.isNaN(date.getTime())) return 0;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sourceDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  return Math.max(
    0,
    Math.floor((today.getTime() - sourceDay.getTime()) / 86400000),
  );
}

function isPaymentAlert(debtor) {
  return (
    debtorStatus(debtor) === "active" &&
    debtorBalance(debtor) > 0 &&
    daysWithoutPayment(debtor) >= ALERT_DAYS
  );
}

export default function DebtorsPage() {
  const { profile } = useAuth();
  const canManage = can(profile, "debtors.manage");
  const canViewTotalDebt = can(profile, "debtors.view_total");
  const [searchParams, setSearchParams] = useSearchParams();
  const initialResponse = debtorService.peekList({ search: "", limit: 100 });
  const [debtors, setDebtors] = useState(() => initialResponse?.data || []);
  const [summary, setSummary] = useState(() =>
    initialResponse?.meta?.summary || {
      AFN: 0,
      USD: 0,
      total: 0,
      overdue: 0,
    },
  );
  const [loading, setLoading] = useState(() => !initialResponse);
  const [view, setView] = useState("grid");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("amount_desc");
  const [showAdd, setShowAdd] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState(null);
  const [category, setCategory] = useState("all");
  const [badCurrency, setBadCurrency] = useState("AFN");
  const [alertOnly, setAlertOnly] = useState(false);

  const load = useCallback(async () => {
    if (!debtorService.peekList({ search, limit: 100 })) setLoading(true);
    try {
      const response = await debtorService.list({ search, limit: 100 });
      setDebtors(response.data || []);
      setSummary(
        response.meta?.summary || {
          AFN: 0,
          USD: 0,
          total: 0,
          overdue: 0,
        },
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "قرضداران ترلاسه نه شول."));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    // Do not add an artificial delay to the initial debtors view. Only typed
    // searches are debounced so the normal overview can paint immediately.
    const delay = search.trim() ? 250 : 0;
    const timer = setTimeout(load, delay);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    if (searchParams.get("action") === "add" && canManage) {
      setShowAdd(true);
    }
  }, [searchParams, canManage]);

  const closeAdd = () => {
    setShowAdd(false);
    if (searchParams.has("action")) {
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  };

  const moveToBadDebt = async (debtor) => {
    if (
      !window.confirm(
        `آیا ${debtor.name} سوخته قرض ته انتقال شي؟ د حساب او تاریخچې معلومات به محفوظ پاتې شي.`,
      )
    ) {
      return;
    }

    try {
      await debtorService.update(debtor.id, {
        debt_status: "bad",
        bad_debt_at: new Date().toISOString(),
      });
      toast.success(`${debtor.name} سوخته قرض ته انتقال شو.`);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "سوخته قرض ته انتقال ونه شو."));
    }
  };

  const activeDebtors = useMemo(
    () => debtors.filter((debtor) => debtorStatus(debtor) === "active"),
    [debtors],
  );

  const badDebtors = useMemo(
    () => debtors.filter((debtor) => debtorStatus(debtor) === "bad"),
    [debtors],
  );

  const alertDebtors = useMemo(
    () => activeDebtors.filter(isPaymentAlert),
    [activeDebtors],
  );

  const afnTotal = useMemo(
    () =>
      activeDebtors
        .filter((debtor) => debtor.currency !== "USD")
        .reduce((sum, debtor) => sum + debtorBalance(debtor), 0),
    [activeDebtors],
  );

  const usdTotal = useMemo(
    () =>
      activeDebtors
        .filter((debtor) => debtor.currency === "USD")
        .reduce((sum, debtor) => sum + debtorBalance(debtor), 0),
    [activeDebtors],
  );

  const badAfnTotal = useMemo(
    () =>
      badDebtors
        .filter((debtor) => debtor.currency !== "USD")
        .reduce((sum, debtor) => sum + debtorBalance(debtor), 0),
    [badDebtors],
  );

  const badUsdTotal = useMemo(
    () =>
      badDebtors
        .filter((debtor) => debtor.currency === "USD")
        .reduce((sum, debtor) => sum + debtorBalance(debtor), 0),
    [badDebtors],
  );

  const filteredDebtors = useMemo(() => {
    let list;
    if (alertOnly) list = [...alertDebtors];
    else if (category === "all") list = [...debtors];
    else if (category === "bad") {
      list = badDebtors.filter((debtor) =>
        badCurrency === "USD" ? debtor.currency === "USD" : debtor.currency !== "USD",
      );
    } else {
      list = activeDebtors.filter((debtor) =>
        category === "USD" ? debtor.currency === "USD" : debtor.currency !== "USD",
      );
    }

    const timeOf = (value) => {
      const time = value ? new Date(value).getTime() : 0;
      return Number.isFinite(time) ? time : 0;
    };

    return list.sort((a, b) => {
      if (sortBy === "last_payment") {
        return timeOf(b.last_payment_at || b.last_payment_date) - timeOf(a.last_payment_at || a.last_payment_date);
      }
      if (sortBy === "last_change") {
        return timeOf(b.last_activity_at || b.updated_at || b.created_at) - timeOf(a.last_activity_at || a.updated_at || a.created_at);
      }
      return debtorBalance(b) - debtorBalance(a);
    });
  }, [activeDebtors, alertDebtors, alertOnly, badCurrency, badDebtors, category, debtors, sortBy]);

  const currentListTitle = alertOnly
    ? "د الیرټ قرضداران"
    : category === "all"
      ? "ټول قرضداران"
      : category === "bad"
        ? badCurrency === "USD"
          ? "سوخته قرض — ډالر"
          : "سوخته قرض — افغانۍ"
        : category === "USD"
          ? "ډالر قرضداران"
          : "افغانۍ قرضداران";

  const summaryCards = [
    {
      title: "ټول قرضداران",
      value: `${debtors.length}`,
      caption: "فعال حسابونه",
      tone: "violet",
      iconType: "users",
    },
    {
      title: "ټول قرض AFN",
      value: canViewTotalDebt ? `${formatAfghanMoney(afnTotal)}` : "محدود",
      caption: canViewTotalDebt ? "ټول افغاني قرض" : "Permission نشته",
      tone: "emerald",
      iconType: "afn",
    },
    {
      title: "ټول قرض USD",
      value: canViewTotalDebt ? `${formatUsdMoney(usdTotal)}` : "محدود",
      caption: canViewTotalDebt ? "ټول ډالري قرض" : "Permission نشته",
      tone: "blue",
      iconType: "usd",
    },
    {
      title: "الیرټ",
      value: `${alertDebtors.length}`,
      caption: `${ALERT_DAYS}+ ورځې وصولي نشته`,
      tone: "orange",
      iconType: "alert",
      onClick: () => setAlertOnly(true),
    },
  ];

  return (
    <div className="page-enter min-w-0 space-y-5">
      <section className="wms-hero-section overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-xl shadow-slate-900/10 sm:rounded-[34px]">
        <div className="wms-photo-hero relative min-h-[290px] overflow-hidden px-5 pb-32 pt-6 text-white sm:min-h-[210px] sm:px-8 sm:pb-16 sm:pt-7 lg:min-h-[220px]" style={{ backgroundImage: "url('/header-images/header-daisy.jpeg')" }}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/72 via-blue-950/42 to-sky-800/18" />

          <div className="relative z-10 flex h-full flex-col justify-between gap-5 sm:flex-row-reverse sm:items-start">
            <div dir="rtl" className="relative z-20 max-w-xl self-end text-right drop-shadow-sm sm:ml-auto">
              <p className="text-sm font-bold text-blue-100"></p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
                قرضداران
              </h1>
              <p className="mt-3 max-w-lg text-sm font-semibold leading-7 text-blue-50 sm:text-base">
                د مشتریانو قرضونه، وصولي او پاتې حسابونه په اسانه او منظم ډول مدیریت کړئ.
              </p>
            </div>

            {canManage ? (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="inline-flex h-12 w-fit items-center justify-center gap-2 self-start rounded-2xl border border-white/80 bg-white px-5 text-sm font-black text-blue-700 shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-blue-50 sm:text-base"
              >
                <FiPlus className="text-lg" />
                نوی قرضدار
              </button>
            ) : null}
          </div>
        </div>

        <div className="wms-summary-grid relative z-20 -mt-10 grid grid-cols-2 gap-3 px-3 pb-5 sm:-mt-12 sm:gap-4 sm:px-6 sm:pb-7 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <DebtorSummaryCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-4">
        <div dir="rtl" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <CategoryButton
            active={!alertOnly && category === "all"}
            label="ټول قرض"
            caption={`${debtors.length} قرضداران`}
            tone="violet"
            onClick={() => {
              setAlertOnly(false);
              setCategory("all");
            }}
          />
          <CategoryButton
            active={!alertOnly && category === "AFN"}
            label="افغانۍ قرض"
            caption={`${activeDebtors.filter((item) => item.currency !== "USD").length} قرضداران`}
            tone="emerald"
            onClick={() => {
              setAlertOnly(false);
              setCategory("AFN");
            }}
          />
          <CategoryButton
            active={!alertOnly && category === "USD"}
            label="ډالر قرض"
            caption={`${activeDebtors.filter((item) => item.currency === "USD").length} قرضداران`}
            tone="blue"
            onClick={() => {
              setAlertOnly(false);
              setCategory("USD");
            }}
          />
          <CategoryButton
            active={!alertOnly && category === "bad"}
            label="سوخته قرض"
            caption={`${badDebtors.length} قرضداران`}
            tone="orange"
            onClick={() => {
              setAlertOnly(false);
              setCategory("bad");
            }}
          />
        </div>

        {category === "bad" && !alertOnly ? (
          <>
            <div dir="rtl" className="mt-3 flex justify-center gap-2 rounded-2xl bg-orange-50 p-2">
            <button
              type="button"
              onClick={() => setBadCurrency("AFN")}
              className={`rounded-xl px-5 py-2 text-sm font-black transition ${
                badCurrency === "AFN"
                  ? "bg-orange-500 text-white shadow-md"
                  : "bg-white text-orange-700"
              }`}
            >
              AFN سوخته
            </button>
            <button
              type="button"
              onClick={() => setBadCurrency("USD")}
              className={`rounded-xl px-5 py-2 text-sm font-black transition ${
                badCurrency === "USD"
                  ? "bg-orange-500 text-white shadow-md"
                  : "bg-white text-orange-700"
              }`}
            >
              $ USD سوخته
            </button>
          </div>

          <div
            dir="rtl"
            className={`mt-3 flex items-center justify-between gap-4 rounded-[20px] border px-4 py-3 shadow-sm ${
              badCurrency === "USD"
                ? "border-blue-200 bg-blue-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <div className="text-right">
              <p className="text-xs font-black text-slate-500">
                {badCurrency === "USD"
                  ? "جمله سوخته ډالر"
                  : "جمله سوخته افغانۍ"}
              </p>
              <p
                className={`mt-1 text-xl font-black sm:text-2xl ${
                  badCurrency === "USD"
                    ? "text-blue-700"
                    : "text-emerald-700"
                }`}
              >
                {badCurrency === "USD"
                  ? formatUsdMoney(badUsdTotal)
                  : formatAfghanMoney(badAfnTotal)}
              </p>
            </div>

            <span
              className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl font-black ${
                badCurrency === "USD"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {badCurrency === "USD" ? "$" : "؋"}
            </span>
          </div>
          </>
        ) : null}

        {alertOnly ? (
          <div dir="rtl" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-right">
              <FiClock className="text-amber-600" />
              <div>
                <p className="text-sm font-black text-amber-900">د الیرټ لیست</p>
                <p className="text-xs font-bold text-amber-700">
                  هغه کسان چې لږ تر لږه {ALERT_DAYS} ورځې یې وصولي نه ده کړې.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAlertOnly(false)}
              className="rounded-xl bg-white px-4 py-2 text-xs font-black text-amber-800 shadow-sm"
            >
              الیرټ بند کړه
            </button>
          </div>
        ) : null}
      </section>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div dir="rtl" className="min-w-0 text-right">
            <h2 className="text-xl font-black text-slate-950 sm:text-2xl">
              {currentListTitle}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {alertOnly
                ? `د ${ALERT_DAYS} یا زیاتو ورځو راهیسې وصولي نه لرونکي قرضداران`
                : category === "all"
                  ? "ټول فعال او سوخته قرضداران په یوه لیست کې"
                  : category === "bad"
                    ? "سوخته قرضداران د افغانیو او ډالرو په جلا برخو کې"
                    : "فعال قرضداران او د هغوی پاتې حسابونه"}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-2xl lg:items-center lg:justify-end">
            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:w-auto sm:grid-cols-[minmax(180px,1fr)_165px]">
              <div className="min-w-0">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="د قرضدار نوم یا Phone..."
                  className="min-w-0 w-full"
                />
              </div>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700 outline-none focus:border-blue-400 sm:px-3 sm:text-xs"
                aria-label="د قرضدارانو ترتیب"
              >
                <option value="amount_desc">ډېر مقدار سر ته</option>
                <option value="last_change">وروستی بدلون سر ته</option>
                <option value="last_payment">وروستۍ وصولي سر ته</option>
              </select>
            </div>

            <div className="flex shrink-0 gap-2 self-start rounded-2xl border border-slate-200 bg-slate-50/90 p-1 shadow-sm">
              <button
                type="button"
                aria-label="Grid view"
                className={`icon-button ${
                  view === "grid"
                    ? "border-brand-300 bg-brand-600 text-white hover:text-white shadow-md"
                    : "bg-white"
                }`}
                onClick={() => setView("grid")}
              >
                <FiGrid />
              </button>

              <button
                type="button"
                aria-label="Table view"
                className={`icon-button ${
                  view === "table"
                    ? "border-brand-300 bg-brand-600 text-white hover:text-white shadow-md"
                    : "bg-white"
                }`}
                onClick={() => setView("table")}
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
          ) : filteredDebtors.length === 0 ? (
            <div className="p-6">
              <EmptyState title="قرضدار نشته" />
            </div>
          ) : view === "grid" ? (
            <div className="grid min-w-0 gap-3 md:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredDebtors.map((debtor) => (
                <DebtorCard
                  key={debtor.id}
                  debtor={debtor}
                  onEdit={() => setEditingDebtor(debtor)}
                  canManage={canManage}
                  isAlert={isPaymentAlert(debtor)}
                />
              ))}
            </div>
          ) : (
            <DebtorTable
              debtors={filteredDebtors}
              onEdit={setEditingDebtor}
              canManage={canManage}
            />
          )}
        </div>
      </Card>

      <Modal open={canManage && showAdd} onClose={closeAdd} title="نوی قرضدار" size="sm">
        <DebtorForm
          onCancel={closeAdd}
          onSaved={() => {
            closeAdd();
            load();
          }}
        />
      </Modal>

      <Modal
        open={canManage && Boolean(editingDebtor)}
        onClose={() => setEditingDebtor(null)}
        title="قرضدار اصلاح کړه"
        size="sm"
      >
        {editingDebtor ? (
          <DebtorEditForm
            debtor={editingDebtor}
            onCancel={() => setEditingDebtor(null)}
            onMoveBad={async () => {
              const current = editingDebtor;
              await moveToBadDebt(current);
              setEditingDebtor(null);
            }}
            onSaved={async () => {
              setEditingDebtor(null);
              await load();
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function DebtorsHeaderArtwork() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(255,255,255,0.22),transparent_26%),radial-gradient(circle_at_18%_88%,rgba(14,165,233,0.25),transparent_30%)]" />
      <div className="absolute -right-20 -top-24 size-72 rounded-full border border-white/15 bg-white/10 blur-sm" />
      <div className="absolute -left-16 bottom-[-100px] size-72 rounded-full bg-blue-950/25 blur-3xl" />

      <svg
        viewBox="0 0 760 260"
        className="absolute bottom-0 left-0 h-[132px] w-[78%] opacity-55 sm:inset-y-0 sm:h-full sm:w-[58%] sm:opacity-80 lg:w-[54%] lg:opacity-90"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="receivableCardGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.10" />
          </linearGradient>
          <linearGradient id="receivableCoinGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        <g opacity="0.32" stroke="#dbeafe" strokeWidth="1.5">
          <path d="M40 75L145 35L260 70L365 25L480 70L590 35L720 80" fill="none" />
          <path d="M45 190L150 150L265 188L370 135L485 185L600 145L715 188" fill="none" />
          <circle cx="145" cy="35" r="5" fill="#ffffff" />
          <circle cx="365" cy="25" r="5" fill="#ffffff" />
          <circle cx="590" cy="35" r="5" fill="#ffffff" />
        </g>

        <g transform="translate(165 40)">
          <rect x="0" y="20" rx="24" width="250" height="160" fill="url(#receivableCardGradient)" stroke="#ffffff" strokeOpacity="0.32" />
          <circle cx="55" cy="70" r="28" fill="#ffffff" fillOpacity="0.25" />
          <circle cx="55" cy="62" r="10" fill="#ffffff" fillOpacity="0.82" />
          <path d="M37 90c5-17 32-17 37 0" fill="#ffffff" fillOpacity="0.82" />
          <rect x="105" y="52" rx="7" width="110" height="12" fill="#ffffff" fillOpacity="0.72" />
          <rect x="105" y="78" rx="6" width="80" height="9" fill="#ffffff" fillOpacity="0.40" />
          <rect x="30" y="120" rx="10" width="180" height="35" fill="#0f172a" fillOpacity="0.20" />
          <text x="120" y="143" textAnchor="middle" fill="#ffffff" fontSize="21" fontWeight="800">RECEIVABLES</text>
        </g>

        <g transform="translate(405 32)">
          <rect x="0" y="0" rx="18" width="120" height="155" fill="#ffffff" fillOpacity="0.90" />
          <rect x="18" y="22" rx="4" width="66" height="9" fill="#2563eb" fillOpacity="0.65" />
          <rect x="18" y="45" rx="4" width="86" height="7" fill="#93c5fd" />
          <rect x="18" y="62" rx="4" width="72" height="7" fill="#bfdbfe" />
          <rect x="18" y="79" rx="4" width="82" height="7" fill="#bfdbfe" />
          <rect x="18" y="109" rx="5" width="24" height="24" fill="#2563eb" fillOpacity="0.75" />
          <rect x="49" y="100" rx="5" width="24" height="33" fill="#0ea5e9" fillOpacity="0.72" />
          <rect x="80" y="86" rx="5" width="24" height="47" fill="#22d3ee" fillOpacity="0.78" />
          <text x="60" y="16" textAnchor="middle" fill="#2563eb" fontSize="12" fontWeight="900">INVOICE</text>
        </g>

        <g transform="translate(525 112)">
          {[0, 1, 2].map((item) => (
            <g key={item} transform={`translate(${item * 36} ${item % 2 === 0 ? 12 : 0})`}>
              <ellipse cx="18" cy="54" rx="28" ry="10" fill="#f59e0b" fillOpacity="0.72" />
              <rect x="-10" y="18" width="56" height="36" fill="url(#receivableCoinGradient)" />
              <ellipse cx="18" cy="18" rx="28" ry="10" fill="#fde68a" />
              <text x="18" y="25" textAnchor="middle" fill="#b45309" fontSize="15" fontWeight="900">$</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function DebtorSummaryCard({ title, value, caption, tone, iconType, onClick }) {
  const tones = {
    violet: {
      iconWrap: "bg-violet-100 text-violet-700",
      caption: "text-violet-600",
      border: "border-violet-100",
    },
    emerald: {
      iconWrap: "bg-emerald-100 text-emerald-700",
      caption: "text-emerald-600",
      border: "border-emerald-100",
    },
    blue: {
      iconWrap: "bg-blue-100 text-blue-700",
      caption: "text-blue-600",
      border: "border-blue-100",
    },
    orange: {
      iconWrap: "bg-orange-100 text-orange-600",
      caption: "text-orange-600",
      border: "border-orange-100",
    },
  };

  const style = tones[tone] || tones.blue;

  return (
    <article
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) onClick();
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`wms-summary-card min-w-0 rounded-[22px] border ${style.border} bg-white p-3.5 shadow-[0_18px_38px_rgba(15,23,42,0.14)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(37,99,235,0.18)] sm:rounded-[26px] sm:p-5 ${onClick ? "cursor-pointer ring-2 ring-transparent hover:ring-orange-200" : ""}`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl shadow-sm sm:size-14 sm:text-2xl ${style.iconWrap}`}>
          <SummaryIcon type={iconType} />
        </span>

        <div dir="rtl" className="min-w-0 flex-1 text-right">
          <p className="truncate text-[12px] font-black text-slate-700 sm:text-sm">{title}</p>
          <p className="mt-1 truncate text-xl font-black tracking-tight text-slate-950 sm:text-[1.75rem]">{value}</p>
          <p className={`mt-1 truncate text-[11px] font-bold sm:text-xs ${style.caption}`}>{caption}</p>
        </div>
      </div>
    </article>
  );
}

function SummaryIcon({ type }) {
  if (type === "users") return <FiUsers />;
  if (type === "alert") return <FiAlertTriangle />;
  if (type === "usd") return <span className="font-black">$</span>;
  if (type === "afn") return <span className="font-black">؋</span>;
  return <FiUsers />;
}

function DebtorCard({ debtor, onEdit, canManage, isAlert }) {
  const balance = debtorBalance(debtor);
  const isBad = debtorStatus(debtor) === "bad";

  return (
    <article className={`group relative min-w-0 overflow-hidden rounded-[22px] border text-white shadow-[0_14px_32px_rgba(30,64,175,0.20)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_44px_rgba(30,64,175,0.28)] ${
      isBad
        ? "border-orange-300/70 bg-gradient-to-br from-slate-800 via-slate-700 to-orange-700"
        : "border-blue-200/60 bg-gradient-to-br from-blue-800 via-blue-600 to-cyan-500"
    }`}>
      <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full border border-white/15 bg-white/10 blur-sm" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 size-52 rounded-full bg-blue-950/20 blur-2xl" />

      <div className="relative z-10 p-3 sm:p-4">
        <div className="flex items-center justify-center gap-2">
          {isBad ? (
            <span className="rounded-full bg-orange-400/20 px-2.5 py-1 text-[9px] font-black text-orange-100 ring-1 ring-orange-200/30">
              سوخته قرض
            </span>
          ) : null}
          {isAlert ? (
            <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[9px] font-black text-amber-950">
              الیرټ • {daysWithoutPayment(debtor)} ورځې
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-col items-center justify-center text-center">
          <div className="flex size-11 items-center justify-center overflow-hidden rounded-full border-2 border-white/45 bg-white text-lg font-black text-blue-700 shadow-xl sm:size-12 sm:text-xl">
            {debtor.photo ? (
              <img src={debtor.photo} alt={debtor.name} className="h-full w-full object-cover" />
            ) : (
              <FiUser />
            )}
          </div>
          <h3 dir="rtl" className="mt-2 max-w-full truncate rounded-xl border border-white/25 bg-white/10 px-4 py-1.5 text-center text-lg font-black leading-tight text-white backdrop-blur-sm sm:text-xl">
            {debtor.name}
          </h3>
        </div>

        <div dir="rtl" className="mt-3 overflow-hidden rounded-[16px] border border-white/25 bg-white/12 px-3 py-2.5 text-center shadow-inner backdrop-blur-sm">
          <p className="text-[10px] font-black text-blue-100">جمله باقی</p>
          <p className="mt-1 truncate text-lg font-black text-white sm:text-xl">{formatMoney(balance, debtor.currency)}</p>
        </div>

        <div className={`mt-3 grid items-center gap-2 ${canManage ? "grid-cols-[48px_1fr]" : "grid-cols-1"}`}>
          {canManage ? (
            <button
              type="button"
              className="flex h-9 items-center justify-center rounded-xl bg-white/15 text-base text-white ring-1 ring-white/25 transition hover:bg-white/25"
              onClick={onEdit}
              aria-label={`Edit ${debtor.name}`}
            >
              <FiEdit2 />
            </button>
          ) : null}

          <Link
            to={`/debtors/${debtor.id}`}
            onMouseEnter={() => void debtorService.prefetch(debtor.id)}
            onFocus={() => void debtorService.prefetch(debtor.id)}
            onTouchStart={() => void debtorService.prefetch(debtor.id)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-xs font-black text-blue-700 shadow-md transition hover:bg-blue-50"
          >
            <span>View Details</span>
            <FiEye />
          </Link>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-1.5 border-t border-white/15 bg-blue-950/20 px-3 py-1.5 text-[9px] font-bold text-blue-50 sm:text-[10px]">
        <FiCalendar className="shrink-0" />
        <span>Last Payment:</span>
        <span className="font-black text-white">{formatDate(debtor.last_payment_date)}</span>
      </div>
    </article>
  );
}

function DebtorTable({ debtors, onEdit, canManage }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:hidden">
        {debtors.map((debtor) => {
          const balance = debtorBalance(debtor);
          const isBad = debtorStatus(debtor) === "bad";

          return (
            <article key={debtor.id} className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.07)]">
              <div dir="rtl" className="flex flex-col items-center justify-center border-b border-slate-100 bg-gradient-to-l from-blue-50 via-white to-cyan-50 p-3 text-center">
                <span className="flex size-10 items-center justify-center overflow-hidden rounded-2xl bg-blue-100 text-lg text-blue-700 shadow-sm">
                  {debtor.photo ? <img src={debtor.photo} alt={debtor.name} className="h-full w-full object-cover" /> : <FiUser />}
                </span>
                <div className="mt-2 flex items-center justify-center gap-2">
                  {isBad ? <span className="rounded-full bg-orange-100 px-2 py-1 text-[9px] font-black text-orange-700">سوخته</span> : null}
                  <p className="max-w-[70vw] truncate text-base font-black text-slate-950">{debtor.name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-3">
                <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                  <p className="text-[10px] font-black text-slate-500">Currency</p>
                  <span className={`mt-1.5 inline-flex min-w-[62px] items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-black ${debtor.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {debtor.currency === "USD" ? "$ USD" : "؋ AFN"}
                  </span>
                </div>
                <div className="rounded-xl border border-red-100 bg-gradient-to-l from-red-50 to-orange-50 p-2.5 text-center">
                  <p className="text-[9px] font-black text-red-500">جمله باقی</p>
                  <p className="mt-1 truncate text-sm font-black text-red-700">{formatMoney(balance, debtor.currency)}</p>
                </div>
                <div className="col-span-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                  <span>{formatDate(debtor.last_payment_date)}</span>
                  <span>Last Payment</span>
                </div>
              </div>

              <div className={`grid gap-2 border-t border-slate-100 p-3 ${canManage ? "grid-cols-[1fr_50px]" : "grid-cols-1"}`}>
                <Link to={`/debtors/${debtor.id}`} onMouseEnter={() => void debtorService.prefetch(debtor.id)} onFocus={() => void debtorService.prefetch(debtor.id)} onTouchStart={() => void debtorService.prefetch(debtor.id)} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700">
                  <span>View</span><FiEye />
                </Link>
                {canManage ? (
                  <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 text-white shadow-md" onClick={() => onEdit(debtor)} aria-label={`Edit ${debtor.name}`}>
                    <FiEdit2 />
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)] md:block">
        <div className="overflow-x-auto">
          <table dir="rtl" className="min-w-[860px] w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-slate-50/95">
              <tr>
                {["نوم", "Currency", "جمله باقی", "Last Payment", "Action"].map((item) => (
                  <th key={item} className="border-b border-l border-slate-200 px-4 py-3 text-center text-xs font-black text-slate-600 last:border-l-0">{item}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debtors.map((debtor, index) => {
                const balance = debtorBalance(debtor);
                const isBad = debtorStatus(debtor) === "bad";
                return (
                  <tr key={debtor.id} className={`${index % 2 ? "bg-slate-50/55" : "bg-white"} transition hover:bg-blue-50/50`}>
                    <td className="border-b border-l border-slate-200 px-4 py-3 text-center">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <span className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-blue-100 text-blue-700 shadow-sm">
                          {debtor.photo ? <img src={debtor.photo} alt={debtor.name} className="h-full w-full object-cover" /> : <FiUser />}
                        </span>
                        <div className="flex items-center justify-center gap-2">
                          {isBad ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[8px] font-black text-orange-700">سوخته</span> : null}
                          <p className="max-w-[230px] truncate font-black text-slate-900">{debtor.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-l border-slate-200 px-4 py-3 text-center">
                      <span className={`inline-flex min-w-[70px] items-center justify-center rounded-full px-3 py-1 text-xs font-black ${debtor.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {debtor.currency === "USD" ? "$ USD" : "؋ AFN"}
                      </span>
                    </td>
                    <td className="border-b border-l border-slate-200 px-3 py-2.5 text-center">
                      <div className="mx-auto max-w-[220px] rounded-xl border border-red-100 bg-gradient-to-l from-red-50 to-orange-50 px-3 py-2 shadow-sm">
                        <p className="text-[9px] font-black text-red-500">جمله باقی</p>
                        <p className="mt-0.5 truncate text-base font-black text-red-700">{formatMoney(balance, debtor.currency)}</p>
                      </div>
                    </td>
                    <td className="border-b border-l border-slate-200 px-4 py-3 text-center text-xs font-semibold text-slate-700">{formatDate(debtor.last_payment_date)}</td>
                    <td className="border-b border-slate-200 px-4 py-3">
                      <div className="flex justify-center gap-2">
                        <Link className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-50" to={`/debtors/${debtor.id}`} onMouseEnter={() => void debtorService.prefetch(debtor.id)} onFocus={() => void debtorService.prefetch(debtor.id)} onTouchStart={() => void debtorService.prefetch(debtor.id)}>
                          <span>View</span><FiEye />
                        </Link>
                        {canManage ? (
                          <button type="button" className="inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 text-white shadow-md" onClick={() => onEdit(debtor)} aria-label={`Edit ${debtor.name}`}>
                            <FiEdit2 />
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
      </div>
    </div>
  );
}

function CategoryButton({ active, label, caption, tone, onClick }) {
  const tones = {
    violet: active
      ? "border-violet-500 bg-violet-600 text-white shadow-violet-600/20"
      : "border-violet-100 bg-violet-50 text-violet-800",
    emerald: active ? "border-emerald-500 bg-emerald-600 text-white shadow-emerald-600/20" : "border-emerald-100 bg-emerald-50 text-emerald-800",
    blue: active ? "border-blue-500 bg-blue-600 text-white shadow-blue-600/20" : "border-blue-100 bg-blue-50 text-blue-800",
    orange: active ? "border-orange-500 bg-orange-500 text-white shadow-orange-500/20" : "border-orange-100 bg-orange-50 text-orange-800",
  };
  return (
    <button type="button" onClick={onClick} className={`min-w-0 rounded-[18px] border px-3 py-3 text-right shadow-md transition hover:-translate-y-0.5 ${tones[tone]}`}>
      <p className="truncate text-sm font-black sm:text-base">{label}</p>
      <p className={`mt-1 truncate text-[10px] font-bold sm:text-xs ${active ? "text-white/80" : "opacity-70"}`}>{caption}</p>
    </button>
  );
}

function DebtorEditForm({ debtor, onCancel, onMoveBad, onSaved }) {
  const [form, setForm] = useState({
    name: debtor.name || "",
    phone: debtor.phone || "",
    address: debtor.address || "",
    email: debtor.email || "",
    currency: debtor.currency || "AFN",
    notes: debtor.notes || "",
    photo: debtor.photo || "",
    openingBalance: "",
  });
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [openingRecord, setOpeningRecord] = useState(null);

  useEffect(() => {
    let active = true;
    debtorService.get(debtor.id).then((details) => {
      if (!active) return;
      const records = details?.balances || [];
      const initial = records.find((row) => String(row.note || "").trim() === "سابقه باقي") || null;
      setOpeningRecord(initial);
      setForm((current) => ({ ...current, openingBalance: String(initial?.amount || "") }));
    }).catch(() => {});
    return () => { active = false; };
  }, [debtor.id]);

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const pickPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhotoBusy(true);
    try {
      const photo = await prepareDebtorPhoto(file);
      change("photo", photo);
    } catch (error) {
      toast.error(getErrorMessage(error, "عکس اضافه نه شو."));
    } finally {
      setPhotoBusy(false);
      event.target.value = "";
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return toast.error("نوم ضروري دی.");

    setSaving(true);
    try {
      await debtorService.update(debtor.id, {
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
      });
      const openingAmount = Math.max(0, Number(form.openingBalance || 0));
      if (openingRecord?.id && openingAmount > 0) {
        await debtorService.updateBalance(debtor.id, openingRecord.id, {
          amount: openingAmount,
          type: openingRecord.type || "bill_transfer",
          date: openingRecord.record_date || openingRecord.date || new Date().toISOString().slice(0, 10),
          date_shamsi: openingRecord.date_shamsi || undefined,
          note: "سابقه باقي",
        });
      } else if (!openingRecord?.id && openingAmount > 0) {
        await debtorService.balance(debtor.id, {
          amount: openingAmount,
          type: "bill_transfer",
          note: "سابقه باقي",
          date: new Date().toISOString().slice(0, 10),
        });
      }
      toast.success("د قرضدار معلومات او سابقه باقي اصلاح شول.");
      await onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "معلومات اصلاح نه شول."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-3">
      <div className="rounded-[18px] bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 p-3.5 text-white">
        <p className="text-[11px] font-black text-blue-100">د قرضدار معلومات</p>
        <p className="mt-1 truncate text-lg font-black">{debtor.name}</p>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-[18px] border border-slate-200 bg-slate-50 p-3 transition hover:border-blue-300 hover:bg-blue-50">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-xl text-blue-600 shadow-sm ring-1 ring-slate-200">
          {form.photo ? (
            <img
              src={form.photo}
              alt="Debtor"
              className="h-full w-full object-cover"
            />
          ) : (
            <FiCamera />
          )}
        </span>
        <span className="min-w-0 flex-1 text-right">
          <span className="block text-sm font-black text-slate-800">
            {photoBusy ? "عکس تیارېږي..." : "د قرضدار عکس"}
          </span>
          <span className="mt-1 block text-[11px] font-bold text-slate-500">
            د بدلولو لپاره کلیک وکړئ
          </span>
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={pickPhoto}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نوم"><input className="field h-10" value={form.name} onChange={(event) => change("name", event.target.value)} /></Field>
        <Field label="Phone"><input dir="ltr" className="field h-10" value={form.phone} onChange={(event) => change("phone", event.target.value)} /></Field>
        <Field label="Currency">
          <select className="field h-10" value={form.currency} onChange={(event) => change("currency", event.target.value)}>
            <option value="AFN">AFN</option>
            <option value="USD">USD</option>
          </select>
        </Field>
        <Field label="Email"><input dir="ltr" type="email" className="field h-10" value={form.email} onChange={(event) => change("email", event.target.value)} /></Field>
      </div>
      <Field label="Address"><input className="field h-10" value={form.address} onChange={(event) => change("address", event.target.value)} /></Field>
      <Field label="سابقه باقي"><input dir="ltr" type="number" min="0" step="0.01" className="field h-10" value={form.openingBalance} onChange={(event) => change("openingBalance", event.target.value)} /></Field>
      <Field label="یادداشت"><textarea className="textarea-field min-h-16" value={form.notes} onChange={(event) => change("notes", event.target.value)} /></Field>
      {debtorStatus(debtor) !== "bad" ? (
        <button
          type="button"
          onClick={onMoveBad}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 text-xs font-black text-orange-700 transition hover:bg-orange-100"
        >
          <FiArchive />
          Send to سوخته قرض
        </button>
      ) : (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-center text-xs font-black text-orange-700">
          دا قرضدار په سوخته قرض کې دی
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button type="button" variant="secondary" className="h-10" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="h-10" disabled={saving}><FiEdit2 />{saving ? "ثبتېږي..." : "اصلاح ذخیره کړه"}</Button>
      </div>
    </form>
  );
}

function DebtorForm({ onCancel, onSaved }) {
  const [form, setForm] = useState(emptyDebtor);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const pickPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhotoBusy(true);
    try {
      const photo = await prepareDebtorPhoto(file);
      change("photo", photo);
    } catch (error) {
      toast.error(getErrorMessage(error, "عکس اضافه نه شو."));
    } finally {
      setPhotoBusy(false);
      event.target.value = "";
    }
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("نوم ضروري دی.");
      return;
    }

    if (!form.phone.trim()) {
      toast.error("موبایل نمبر ولیکئ.");
      return;
    }

    setSaving(true);

    try {
      const created = await debtorService.create({
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        currency: form.currency,
        photo: form.photo || "",
        debt_status: "active",
      });
      const openingBalance = Number(form.openingBalance || 0);
      if (created?.id && openingBalance > 0) {
        await debtorService.balance(created.id, {
          amount: openingBalance,
          type: "bill_transfer",
          note: "سابقه باقي",
          date: new Date().toISOString().slice(0, 10),
        });
      }

      toast.success("قرضدار اضافه شو.");
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-4">
      {/* Previous luxury header */}
      <div className="relative overflow-hidden rounded-[26px] border border-blue-100 bg-gradient-to-l from-blue-50 via-white to-cyan-50 p-4 shadow-inner sm:p-5">
        <div className="pointer-events-none absolute -left-12 -top-12 size-36 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-8 size-40 rounded-full bg-blue-400/15 blur-3xl" />

        <div className="relative flex items-center justify-between gap-4">
          <div className="text-right">
            <p className="text-[11px] font-black text-blue-600">د مشتری حساب</p>
            <h3 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
              نوی قرضدار
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500 sm:text-sm">
              نوم، نمبر، ادرس او کرنسي ثبت کړئ.
            </p>
          </div>

          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-xl text-white shadow-lg shadow-blue-600/20 sm:size-14 sm:text-2xl">
            <FiUser />
          </span>
        </div>
      </div>

      {/* Only new addition: optional debtor photo */}
      <label className="group flex cursor-pointer items-center gap-3 rounded-[20px] border border-blue-100 bg-gradient-to-l from-blue-50/80 via-white to-cyan-50/70 p-3 shadow-sm transition hover:border-blue-300 hover:shadow-md">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-xl text-blue-600 shadow-sm ring-1 ring-blue-100 sm:size-16 sm:text-2xl">
          {form.photo ? (
            <img
              src={form.photo}
              alt="Debtor"
              className="h-full w-full object-cover"
            />
          ) : (
            <FiCamera />
          )}
        </span>

        <span className="min-w-0 flex-1 text-right">
          <span className="block text-sm font-black text-slate-800">
            {photoBusy ? "عکس تیارېږي..." : "د قرضدار عکس اضافه کړئ"}
          </span>
          <span className="mt-1 block text-[11px] font-bold text-slate-500">
            اختیاري — JPG / PNG
          </span>
        </span>

        <span className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-[11px] font-black text-blue-600 shadow-sm">
          عکس
        </span>

        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={pickPhoto}
        />
      </label>

      <div className="grid gap-3.5">
        <LuxuryField label="نوم" icon={FiUser}>
          <input
            autoFocus
            className="field h-11 rounded-2xl border-slate-200 bg-slate-50/70 px-4 font-bold focus:bg-white sm:h-12"
            value={form.name}
            onChange={(event) => change("name", event.target.value)}
            placeholder="د قرضدار بشپړ نوم"
          />
        </LuxuryField>

        <div className="grid grid-cols-2 gap-3">
          <LuxuryField label="موبایل نمبر" icon={FiPhone}>
            <input
              dir="ltr"
              className="field h-11 rounded-2xl border-slate-200 bg-slate-50/70 px-3 font-bold focus:bg-white sm:h-12 sm:px-4"
              value={form.phone}
              onChange={(event) => change("phone", event.target.value)}
              placeholder="07XXXXXXXX"
            />
          </LuxuryField>

          <LuxuryField label="کرنسي" icon={FiSave}>
            <select
              className="field h-11 rounded-2xl border-slate-200 bg-slate-50/70 px-3 font-black focus:bg-white sm:h-12 sm:px-4"
              value={form.currency}
              onChange={(event) => change("currency", event.target.value)}
            >
              <option value="AFN">AFN — افغانۍ</option>
              <option value="USD">USD — ډالر</option>
            </select>
          </LuxuryField>
        </div>

        <LuxuryField label="ادرس" icon={FiMapPin}>
          <input
            className="field h-11 rounded-2xl border-slate-200 bg-slate-50/70 px-4 font-bold focus:bg-white sm:h-12"
            value={form.address}
            onChange={(event) => change("address", event.target.value)}
            placeholder="د قرضدار ادرس"
          />
        </LuxuryField>

        <LuxuryField label="سابقه باقي" icon={FiSave}>
          <input
            dir="ltr" type="number" min="0" step="0.01"
            className="field h-11 rounded-2xl border-slate-200 bg-slate-50/70 px-4 font-black focus:bg-white sm:h-12"
            value={form.openingBalance}
            onChange={(event) => change("openingBalance", event.target.value)}
            placeholder="0"
          />
        </LuxuryField>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          className="h-11 rounded-2xl sm:h-12"
        >
          لغوه
        </Button>

        <Button
          type="submit"
          disabled={saving || photoBusy}
          className="h-11 rounded-2xl bg-gradient-to-r from-blue-700 to-cyan-500 shadow-lg shadow-blue-600/20 sm:h-12"
        >
          <FiSave />
          {saving ? "ثبتېږي..." : "ثبت"}
        </Button>
      </div>
    </form>
  );
}

function LuxuryField({ label, icon: Icon, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-start gap-2 text-xs font-black text-slate-700 sm:mb-2 sm:text-sm">
        <Icon className="text-blue-600" />
        {label}
      </span>
      {children}
    </label>
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

function formatAfghanMoney(amount) {
  const value = Number(amount || 0);
  return `${value.toLocaleString()} ؋`;
}

function formatUsdMoney(amount) {
  const value = Number(amount || 0);
  return `$${value.toLocaleString()}`;
}