import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiCreditCard,
  FiDollarSign,
  FiDownload,
  FiFileText,
  FiHash,
  FiPackage,
  FiPhone,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiTruck,
  FiX,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Loading from "../components/ui/Loading";
import { getErrorMessage } from "../lib/api";
import { representativeService, settingsService } from "../Services/wmsService";
import { formatDate, formatNumber } from "../utils/format";

const today = () => new Date().toISOString().slice(0, 10);
const emptyReceipt = {
  date: today(),
  amount: "",
  receipt_number: "",
};

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function money(value, currency = "USD") {
  const amount = Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: Number(value || 0) % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return currency === "AFN" ? `${amount} ؋` : `$ ${amount}`;
}

function matchesPeriod(entry, filters) {
  const date = String(entry.date || "");
  if (filters.from && date < filters.from) return false;
  if (filters.to && date > filters.to) return false;

  const query = filters.search.trim().toLowerCase();
  if (!query) return true;

  return [
    entry.goods_name,
    entry.details,
    entry.shop_address,
    entry.receipt_number,
    entry.description,
  ].some((value) => String(value || "").toLowerCase().includes(query));
}

export default function RepresentativeAccountPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [systemCompany, setSystemCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [receiptModal, setReceiptModal] = useState(false);
  const [receiptForm, setReceiptForm] = useState(emptyReceipt);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ from: "", to: "", search: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [accountResult, settingsResult] = await Promise.allSettled([
        representativeService.account(id),
        settingsService.get(),
      ]);

      if (accountResult.status !== "fulfilled") {
        throw accountResult.reason;
      }

      const rawAccount = accountResult.value;

      // Support both API shapes:
      // 1) direct account object
      // 2) { account: {...} }
      const normalizedAccount =
        rawAccount?.account?.representative
          ? rawAccount.account
          : rawAccount;

      if (!normalizedAccount?.representative) {
        throw new Error("د نماینده حساب معلومات سم ترلاسه نه شول.");
      }

      setAccount({
        ...normalizedAccount,
        charges: Array.isArray(normalizedAccount.charges)
          ? normalizedAccount.charges.filter(Boolean)
          : [],
        receipts: Array.isArray(normalizedAccount.receipts)
          ? normalizedAccount.receipts.filter(Boolean)
          : [],
        ledger: Array.isArray(normalizedAccount.ledger)
          ? normalizedAccount.ledger.filter(Boolean)
          : [],
        summary:
          normalizedAccount.summary &&
          typeof normalizedAccount.summary === "object"
            ? normalizedAccount.summary
            : {},
      });

      if (settingsResult.status === "fulfilled") {
        const settingsValue = settingsResult.value;
        setSystemCompany(
          settingsValue?.company ||
          (settingsValue && typeof settingsValue === "object"
            ? settingsValue
            : null),
        );
      } else {
        setSystemCompany(null);
      }
    } catch (error) {
      console.error("Representative account load error:", error);
      const message = getErrorMessage(
        error,
        "د نماینده حساب ترلاسه نه شو.",
      );
      setAccount(null);
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredCharges = useMemo(
    () =>
      (Array.isArray(account?.charges) ? account.charges : [])
        .filter(Boolean)
        .filter((entry) => matchesPeriod(entry, filters)),
    [account, filters],
  );

  const filteredReceipts = useMemo(
    () =>
      (Array.isArray(account?.receipts) ? account.receipts : [])
        .filter(Boolean)
        .filter((entry) => matchesPeriod(entry, filters)),
    [account, filters],
  );

  const filteredLedger = useMemo(() => {
    const rows = (Array.isArray(account?.ledger) ? account.ledger : [])
      .filter(Boolean)
      .filter((entry) => matchesPeriod(entry, filters));
    let runningBalance = 0;
    return rows.map((entry) => {
      runningBalance = roundMoney(
        Math.max(
          0,
          runningBalance + Number(entry.debit || 0) - Number(entry.credit || 0),
        ),
      );
      return { ...entry, running_balance: runningBalance };
    });
  }, [account, filters]);

  const reportSummary = useMemo(() => {
    const totalAccount = roundMoney(
      filteredCharges.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    );
    const totalReceipts = roundMoney(
      filteredReceipts.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    );
    return {
      total_account: totalAccount,
      total_receipts: totalReceipts,
      remaining: roundMoney(Math.max(0, totalAccount - totalReceipts)),
      delivered_cartons: filteredCharges.reduce(
        (sum, entry) => sum + Number(entry.delivered_quantity || 0),
        0,
      ),
    };
  }, [filteredCharges, filteredReceipts]);

  const submitReceipt = async (event) => {
    event.preventDefault();
    if (!receiptForm.date) return toast.error("تاریخ ضروري دی.");
    if (Number(receiptForm.amount || 0) <= 0) {
      return toast.error("مقدار باید له صفر څخه زیات وي.");
    }
    if (!receiptForm.receipt_number.trim()) {
      return toast.error("د مقابل لوري رسید نمبر ضروري دی.");
    }

    setSaving(true);
    try {
      const result = await representativeService.receipt(id, receiptForm);
      const nextAccount =
        result?.account?.representative
          ? result.account
          : result;

      if (nextAccount?.representative) {
        setAccount({
          ...nextAccount,
          charges: Array.isArray(nextAccount.charges)
            ? nextAccount.charges.filter(Boolean)
            : [],
          receipts: Array.isArray(nextAccount.receipts)
            ? nextAccount.receipts.filter(Boolean)
            : [],
          ledger: Array.isArray(nextAccount.ledger)
            ? nextAccount.ledger.filter(Boolean)
            : [],
          summary:
            nextAccount.summary && typeof nextAccount.summary === "object"
              ? nextAccount.summary
              : {},
        });
      } else {
        await load();
      }
      setReceiptForm({ ...emptyReceipt, date: today() });
      setReceiptModal(false);
      toast.success("وصولي په بریالیتوب ثبت شوه.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["تاریخ", "تفصیل", "بقایه", "وصولي", "روان حساب"],
      ...filteredLedger.map((entry) => [
        entry.date,
        entry.description,
        entry.debit || 0,
        entry.credit || 0,
        entry.running_balance || 0,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${account?.representative?.name || "representative"}-account-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) {
    return (
      <Card className="p-8">
        <Loading />
      </Card>
    );
  }

  if (!account?.representative) {
    return (
      <Card className="p-6 sm:p-8">
        <div dir="rtl" className="mx-auto max-w-xl text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600">
            <FiFileText />
          </div>

          <h2 className="mt-4 text-xl font-black text-slate-900">
            د نماینده حساب خلاص نه شو
          </h2>

          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            {errorMessage || "د حساب معلومات ترلاسه نه شول."}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={load}>
              بیا هڅه وکړه
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(`/representatives/${id}`)}
            >
              بېرته نماینده ته
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const representative = account.representative;
  const currency = account.currency || "USD";
  const summary = account.summary || {};
  const reportNumber = `RA-${String(representative?.id || "REP").toUpperCase()}-${today().replaceAll("-", "")}`;

  return (
    <div className="page-enter min-w-0 space-y-5">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #representative-account-report,
          #representative-account-report * { visibility: visible !important; }
          #representative-account-report {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }
          .account-no-print { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <section className="account-no-print overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-xl shadow-slate-900/10">
        <div className="wms-photo-hero relative overflow-hidden px-5 py-6 text-white sm:px-8 sm:py-8" style={{ backgroundImage: "url('/header-images/header-daisy.jpeg')" }}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/80 via-blue-950/48 to-cyan-950/18" />
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div dir="rtl" className="flex min-w-0 items-center gap-4 text-right">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-[22px] border border-white/50 bg-white/95 text-3xl text-blue-700 shadow-xl sm:size-20 sm:text-4xl">
                <FiCreditCard />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-blue-100">د شرکت حساب</p>
                <h1 className="mt-1 truncate text-3xl font-black sm:text-4xl">
                  {representative.name}
                </h1>
                <p className="mt-2 flex items-center gap-2 text-sm font-bold text-blue-50 sm:text-base">
                  <FiPhone /> {representative.phone || "—"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/representatives")}
              className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-2xl border border-white/50 bg-white/15 px-5 font-black text-white backdrop-blur transition hover:bg-white/25"
            >
              <FiArrowLeft /> بېرته استازو ته
            </button>
          </div>
        </div>

        <div className="relative z-10 -mt-1 grid grid-cols-2 gap-3 p-4 sm:p-6 xl:grid-cols-4">
          <SummaryCard
            title="ټول حساب"
            value={money(summary.total_account, currency)}
            caption="د تسلیم شوو مالونو کرایه"
            icon={FiBookOpen}
            tone="blue"
          />
          <SummaryCard
            title="جمله وصولي"
            value={money(summary.total_receipts, currency)}
            caption="شرکت ته ورکړل شوې پیسې"
            icon={FiCheckCircle}
            tone="green"
          />
          <SummaryCard
            title="جمله باقي"
            value={money(summary.remaining, currency)}
            caption="اتومات حساب؛ په لاس نه بدلېږي"
            icon={FiDollarSign}
            tone="orange"
          />
          <SummaryCard
            title="تسلیم شوي کارتنونه"
            value={formatNumber(summary.delivered_cartons || 0)}
            caption="د حساب سرچینه"
            icon={FiPackage}
            tone="purple"
          />
        </div>
      </section>

      <Card className="account-no-print p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div dir="rtl" className="text-right">
            <h2 className="text-2xl font-black text-slate-950">حساب او راپور</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              بقایه د تسلیم شوو مالونو له کرایې څخه په اتومات ډول محاسبه کېږي.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setReceiptModal(true)}
              disabled={Number(summary.remaining || 0) <= 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 px-4 font-black text-white shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <FiPlus /> وصولي ثبت کړه
            </button>
            <button
              type="button"
              onClick={() => navigate(`/representatives/${id}/account/report`)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 font-black text-blue-700 transition hover:bg-blue-100"
            >
              <FiFileText /> راپور
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 font-black text-violet-700 transition hover:bg-violet-100"
            >
              <FiDownload /> Excel / CSV
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-[1fr_180px_180px]" dir="rtl">
          <label className="relative block">
            <FiSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="field pr-11"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              placeholder="جنس، تفصیل یا رسید نمبر ولټوئ..."
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black text-slate-500">له تاریخ</span>
            <input
              type="date"
              className="field"
              value={filters.from}
              onChange={(event) => setFilters({ ...filters, from: event.target.value })}
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black text-slate-500">تر تاریخ</span>
            <input
              type="date"
              className="field"
              value={filters.to}
              onChange={(event) => setFilters({ ...filters, to: event.target.value })}
            />
          </label>
        </div>
      </Card>

      <div className="account-no-print grid min-w-0 gap-5 2xl:grid-cols-2">
        <HistoryPanel
          title="اتومات بقایات"
          subtitle="دا ریکارډونه په لاس نه جوړېږي؛ د تسلیم شوي مقدار له کرایې څخه راځي."
          icon={FiTruck}
          tone="orange"
          empty="تر اوسه د تسلیم شوي مال کرایه نشته."
        >
          <div className="space-y-3">
            {filteredCharges.map((entry) => (
              <div
                key={entry.id}
                dir="rtl"
                className="rounded-[22px] border border-orange-100 bg-gradient-to-l from-orange-50/80 to-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 text-right">
                    <p className="text-lg font-black text-slate-950">{entry.goods_name}</p>
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                      {entry.details || "تفصیل نشته"}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-2xl border border-orange-200 bg-white px-4 py-2 text-center shadow-sm">
                    <p className="text-xs font-black text-orange-600">بقایه / کرایه</p>
                    <p className="mt-1 text-xl font-black text-orange-700">
                      {money(entry.amount, currency)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <TinyInfo label="تسلیم" value={`${formatNumber(entry.delivered_quantity)} کارتن`} />
                  <TinyInfo label="نرخ ډول" value={entry.rent_type === "ton" ? "فی ټن" : "فی CBM"} />
                  <TinyInfo label="فی نرخ" value={money(entry.rent_rate, currency)} />
                  <TinyInfo label="تاریخ" value={formatDate(entry.date)} />
                </div>
              </div>
            ))}
          </div>
        </HistoryPanel>

        <HistoryPanel
          title="د وصولیو تاریخچه"
          subtitle="هره وصولي د مقابل لوري د رسید نمبر سره ثبتېږي."
          icon={FiCreditCard}
          tone="green"
          empty="تر اوسه وصولي نه ده ثبت شوې."
        >
          <div className="space-y-3">
            {filteredReceipts.map((entry) => (
              <div
                key={entry.id}
                dir="rtl"
                className="grid gap-3 rounded-[22px] border border-emerald-100 bg-gradient-to-l from-emerald-50/80 to-white p-4 shadow-sm sm:grid-cols-[1fr_170px] sm:items-center"
              >
                <div className="text-right">
                  <p className="text-xs font-black text-emerald-600">رسید نمبر</p>
                  <p className="mt-1 flex items-center gap-2 text-lg font-black text-slate-950">
                    <FiHash className="text-emerald-600" /> {entry.receipt_number}
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-500">
                    <FiCalendar /> {formatDate(entry.date)}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-center shadow-sm">
                  <p className="text-xs font-black text-emerald-600">مقدار</p>
                  <p className="mt-1 text-xl font-black text-emerald-700">
                    {money(entry.amount, currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </HistoryPanel>
      </div>

      <Card className="account-no-print min-w-0 overflow-hidden p-0">
        <div dir="rtl" className="border-b border-slate-100 p-5 text-right">
          <h2 className="text-xl font-black text-slate-950">مشترک حسابي Ledger</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">
            بقایه او وصولۍ د تاریخ په ترتیب، له روان حساب سره.
          </p>
        </div>
        <LedgerTable ledger={filteredLedger} currency={currency} />
      </Card>


      {receiptModal ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReceiptModal(false);
          }}
        >
          <form
            dir="rtl"
            onSubmit={submitReceipt}
            className="w-full max-w-xl overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.40)]"
          >
            <div className="relative overflow-hidden bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-500 px-5 py-5 text-white">
              <div className="absolute -left-16 -top-20 size-44 rounded-full bg-white/15 blur-xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="text-right">
                  <p className="text-xs font-black text-emerald-100">د شرکت وصولي</p>
                  <h2 className="mt-1 text-2xl font-black">د {representative.name} وصولي ثبت</h2>
                  <p className="mt-1 text-xs font-bold text-emerald-50">تاریخ، مقدار او د مقابل لوري رسید نمبر اجباري دي.</p>
                </div>
                <button type="button" onClick={() => setReceiptModal(false)} className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15 text-xl"><FiX /></button>
              </div>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              <div className="rounded-[18px] border border-emerald-100 bg-gradient-to-l from-emerald-50 to-white p-4 text-right">
                <p className="text-xs font-black text-emerald-700">موجود باقي حساب</p>
                <p className="mt-1 text-2xl font-black text-emerald-800">{money(summary.remaining, currency)}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="تاریخ *">
                  <input required type="date" className="field h-11" value={receiptForm.date} onChange={(event) => setReceiptForm({ ...receiptForm, date: event.target.value })} />
                </Field>
                <Field label={`مقدار (${currency}) *`}>
                  <input required min="0.01" max={summary.remaining || undefined} step="0.01" type="number" className="field h-11" value={receiptForm.amount} onChange={(event) => setReceiptForm({ ...receiptForm, amount: event.target.value })} placeholder="0.00" />
                </Field>
              </div>

              <Field label="د مقابل لوري رسید نمبر *">
                <input required className="field h-11" value={receiptForm.receipt_number} onChange={(event) => setReceiptForm({ ...receiptForm, receipt_number: event.target.value })} placeholder="هماغه نمبر چې پیسې اخیستونکي درکړی" />
              </Field>

              <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-bold leading-5 text-blue-700">رسید نمبر سیستم پخپله نه جوړوي؛ د مقابل شرکت یا شخص لخوا درکړل شوی نمبر ولیکئ.</p>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="secondary" onClick={() => setReceiptModal(false)}>لغوه</Button>
                <Button type="submit" disabled={saving}><FiCheckCircle /> {saving ? "ثبتېږي..." : "وصولي ثبت کړه"}</Button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, value, caption, icon: Icon, tone }) {
  const tones = {
    blue: "border-blue-100 bg-gradient-to-l from-blue-50 to-white text-blue-700",
    green: "border-emerald-100 bg-gradient-to-l from-emerald-50 to-white text-emerald-700",
    orange: "border-orange-100 bg-gradient-to-l from-orange-50 to-white text-orange-700",
    purple: "border-violet-100 bg-gradient-to-l from-violet-50 to-white text-violet-700",
  };
  return (
    <div dir="rtl" className={`wms-summary-card rounded-[20px] border p-3.5 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm">
          <Icon />
        </span>
        <div className="min-w-0 text-right">
          <p className="text-xs font-black opacity-80">{title}</p>
          <p className="mt-1 truncate text-xl font-black sm:text-2xl">{value}</p>
        </div>
      </div>
      <p className="mt-3 truncate text-[11px] font-bold opacity-70">{caption}</p>
    </div>
  );
}

function HistoryPanel({ title, subtitle, icon: Icon, tone, empty, children }) {
  const panelChildren = children?.props?.children;
  const hasRows = Array.isArray(panelChildren)
    ? panelChildren.length > 0
    : Boolean(panelChildren);
  const tones = {
    orange: "bg-orange-50 text-orange-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div dir="rtl" className="flex items-start gap-3 text-right">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-xl ${tones[tone]}`}>
          <Icon />
        </span>
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">
        {hasRows ? children : <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">{empty}</p>}
      </div>
    </Card>
  );
}

function TinyInfo({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center shadow-sm">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-slate-700">{value}</p>
    </div>
  );
}

function LedgerTable({ ledger, currency, report = false }) {
  if (!ledger.length) {
    return <p className="p-8 text-center font-bold text-slate-500">د ټاکلې مودې حسابي ریکارډ نشته.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className={`${report ? "min-w-[880px]" : "min-w-[980px]"} w-full text-sm`} dir="rtl">
        <thead className="bg-slate-50">
          <tr>
            {[
              "تاریخ",
              "تفصیل",
              "بقایه / Debit",
              "وصولي / Credit",
              "روان حساب",
            ].map((item) => (
              <th key={item} className="px-4 py-4 text-right text-xs font-black text-slate-500">
                {item}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ledger.map((entry) => (
            <tr key={`${entry.type}-${entry.id}`} className="bg-white">
              <td className="whitespace-nowrap px-4 py-4 font-black text-slate-700">
                {formatDate(entry.date)}
              </td>
              <td className="px-4 py-4 text-right font-bold leading-6 text-slate-700">
                {entry.description}
              </td>
              <td className="whitespace-nowrap px-4 py-4 font-black text-orange-700">
                {entry.debit ? money(entry.debit, currency) : "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-4 font-black text-emerald-700">
                {entry.credit ? money(entry.credit, currency) : "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-4 font-black text-blue-700">
                {money(entry.running_balance, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportDetailTable({ title, type, rows, currency }) {
  const isCharge = type === "charges";
  const tone = isCharge
    ? {
        outer: "border-orange-200 bg-orange-50/30",
        heading: "bg-gradient-to-l from-orange-600 to-amber-500 text-white",
        thead: "bg-orange-50 text-orange-800",
        value: "text-orange-700",
      }
    : {
        outer: "border-emerald-200 bg-emerald-50/30",
        heading: "bg-gradient-to-l from-emerald-700 to-teal-500 text-white",
        thead: "bg-emerald-50 text-emerald-800",
        value: "text-emerald-700",
      };

  return (
    <div className={`overflow-hidden rounded-[22px] border-2 shadow-sm ${tone.outer}`}>
      <h3 dir="rtl" className={`px-4 py-3.5 text-right text-base font-black ${tone.heading}`}>{title}</h3>
      {rows.length === 0 ? (
        <p className="bg-white p-6 text-center text-sm font-bold text-slate-500">ریکارډ نشته.</p>
      ) : (
        <div className="overflow-x-auto bg-white">
          <table className="min-w-[620px] w-full text-xs" dir="rtl">
            <thead className={tone.thead}>
              <tr>
                {(isCharge ? ["تاریخ", "جنس او تفصیل", "تسلیم", "نرخ ډول", "مقدار"] : ["تاریخ", "رسید نمبر", "مقدار"]).map((item) => (
                  <th key={item} className="border-b border-current/10 px-3 py-3 text-right font-black">{item}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-3 font-bold">{formatDate(entry.date)}</td>
                  {isCharge ? (
                    <>
                      <td className="px-3 py-3"><p className="font-black">{entry.goods_name}</p><p className="mt-1 max-w-[260px] truncate text-[10px] font-bold text-slate-400">{entry.details || "تفصیل نشته"}</p></td>
                      <td className="px-3 py-3">{formatNumber(entry.delivered_quantity)} کارتن</td>
                      <td className="px-3 py-3">{entry.rent_type === "ton" ? "فی ټن" : "فی CBM"}</td>
                    </>
                  ) : (
                    <td className="px-3 py-3 font-black">{entry.receipt_number}</td>
                  )}
                  <td className={`px-3 py-3 text-base font-black ${tone.value}`}>{money(entry.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function ReportSummary({ label, value, tone }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    purple: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <div dir="rtl" className={`rounded-2xl border p-4 text-right ${tones[tone]}`}>
      <p className="text-xs font-black opacity-75">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

function SignatureBox({ label }) {
  return (
    <div className="pt-12 text-center">
      <div className="border-t border-dashed border-slate-400 pt-3 text-sm font-black text-slate-600">
        {label}
      </div>
    </div>
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
