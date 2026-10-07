import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  FiEdit2,
  FiTrash2,
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
  const cachedAccount = representativeService.peekAccount?.(id);
  const cachedSettings = settingsService.peek?.();
  const [account, setAccount] = useState(() => cachedAccount || null);
  const [systemCompany, setSystemCompany] = useState(() => cachedSettings?.company || null);
  const [loading, setLoading] = useState(() => !cachedAccount);
  const [receiptModal, setReceiptModal] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState(null);
  const [deleteReceiptTarget, setDeleteReceiptTarget] = useState(null);
  const [deletingReceipt, setDeletingReceipt] = useState(false);
  const [receiptForm, setReceiptForm] = useState(emptyReceipt);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ from: "", to: "", search: "" });

  const load = useCallback(async () => {
    if (!representativeService.peekAccount?.(id)) setLoading(true);
    try {
      const [accountResult, settingsResult] = await Promise.all([
        representativeService.account(id),
        settingsService.get().catch(() => ({ company: null })),
      ]);
      setAccount(accountResult);
      setSystemCompany(settingsResult.company || null);
    } catch (error) {
      toast.error(getErrorMessage(error, "د شرکت حساب ترلاسه نه شو."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!receiptModal) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [receiptModal]);

  const filteredCharges = useMemo(
    () => (account?.charges || []).filter((entry) => matchesPeriod(entry, filters)),
    [account, filters],
  );

  const filteredReceipts = useMemo(
    () => (account?.receipts || []).filter((entry) => matchesPeriod(entry, filters)),
    [account, filters],
  );

  const filteredLedger = useMemo(() => {
    const rows = (account?.ledger || []).filter((entry) =>
      matchesPeriod(entry, filters),
    );
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
      const result = editingReceipt
        ? await representativeService.updateReceipt(id, editingReceipt.id, receiptForm)
        : await representativeService.receipt(id, receiptForm);
      setAccount(result);
      setReceiptForm({ ...emptyReceipt, date: today() });
      setEditingReceipt(null);
      setReceiptModal(false);
      toast.success(
        editingReceipt
          ? "وصولي اصلاح شوه او حساب تازه شو."
          : "وصولي په بریالیتوب ثبت شوه.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openNewReceipt = () => {
    setEditingReceipt(null);
    setReceiptForm({ ...emptyReceipt, date: today() });
    setReceiptModal(true);
  };

  const openEditReceipt = (entry) => {
    setEditingReceipt(entry);
    setReceiptForm({
      date: entry.date || entry.payment_date || today(),
      amount: String(entry.amount || ""),
      receipt_number: entry.receipt_number || "",
    });
    setReceiptModal(true);
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
      <Card className="p-8 text-center font-black text-slate-500">
        د شرکت حساب پیدا نه شو.
      </Card>
    );
  }

  const representative = account.representative;
  const currency = account.currency || "USD";
  const summary = account.summary || {};
  const reportNumber = `RA-${String(representative.id).toUpperCase()}-${today().replaceAll("-", "")}`;

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
        <div
          className="wms-photo-hero relative overflow-hidden bg-cover bg-center px-5 py-6 text-white sm:px-8 sm:py-8"
          style={{ backgroundImage: "url('/header-images/header-daisy.jpeg')" }}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/72 via-blue-950/42 to-sky-800/18" />
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

        <div className="relative z-20 grid grid-cols-2 gap-3 px-3 pb-5 sm:px-6 xl:grid-cols-4">
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
            <h2 className="text-2xl font-black text-slate-950">حساب او وصولي</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              بقایه د تسلیم شوو مالونو له کرایې څخه په اتومات ډول محاسبه کېږي.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={openNewReceipt}
              disabled={Number(summary.remaining || 0) <= 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 px-5 font-black text-white shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <FiPlus /> وصولي ثبت کړه
            </button>

            <button
              type="button"
              onClick={() => navigate(`/representatives/${id}/account/report`)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-gradient-to-l from-blue-50 to-cyan-50 px-5 font-black text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100"
            >
              <FiFileText /> راپور
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

      <div className="account-no-print grid min-w-0 gap-4 xl:grid-cols-2">
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
                className="rounded-[18px] border border-orange-200 bg-gradient-to-l from-orange-50/90 via-white to-white p-3 shadow-sm"
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
                className="grid gap-2 rounded-[18px] border border-emerald-200 bg-gradient-to-l from-emerald-50/90 via-white to-white p-3 shadow-sm sm:grid-cols-[1fr_150px] sm:items-center"
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
                <div className="flex items-center gap-2 sm:block sm:space-y-2">
                  <div className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-center shadow-sm sm:rounded-2xl sm:px-4 sm:py-3">
                    <p className="text-[10px] font-black text-emerald-600 sm:text-xs">مقدار</p>
                    <p className="mt-0.5 truncate text-base font-black text-emerald-700 sm:mt-1 sm:text-xl">
                      {money(entry.amount, currency)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5 sm:grid sm:grid-cols-2 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => openEditReceipt(entry)}
                      className="flex size-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-2 sm:text-xs sm:font-black"
                      title="ایډیټ"
                      aria-label="وصولي ایډیټ"
                    >
                      <FiEdit2 /> <span className="hidden sm:inline">ایډیټ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteReceiptTarget(entry)}
                      className="flex size-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-2 sm:text-xs sm:font-black"
                      title="ډلیټ"
                      aria-label="وصولي ډلیټ"
                    >
                      <FiTrash2 /> <span className="hidden sm:inline">ډلیټ</span>
                    </button>
                  </div>
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


      {deleteReceiptTarget ? (
        <DeleteReceiptModal
          receipt={deleteReceiptTarget}
          currency={currency}
          deleting={deletingReceipt}
          onClose={() => {
            if (!deletingReceipt) setDeleteReceiptTarget(null);
          }}
          onConfirm={async () => {
            setDeletingReceipt(true);
            try {
              const result = await representativeService.deleteReceipt(
                id,
                deleteReceiptTarget.id,
              );
              setAccount(result);
              setDeleteReceiptTarget(null);
              toast.success("وصولي ډلیټ شوه او حساب تازه شو.");
            } catch (error) {
              toast.error(getErrorMessage(error, "وصولي ډلیټ نه شوه."));
            } finally {
              setDeletingReceipt(false);
            }
          }}
        />
      ) : null}

      {receiptModal ? (
        <ReceiptModal
          representativeName={representative.name}
          currency={currency}
          remaining={summary.remaining}
          editingReceipt={editingReceipt}
          form={receiptForm}
          saving={saving}
          onChange={setReceiptForm}
          onClose={() => {
            setReceiptModal(false);
            setEditingReceipt(null);
          }}
          onSubmit={submitReceipt}
        />
      ) : null}
    </div>
  );
}

function ReceiptModal({
  representativeName,
  currency,
  remaining,
  editingReceipt,
  form,
  saving,
  onChange,
  onClose,
  onSubmit,
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <form
        dir="rtl"
        onSubmit={onSubmit}
        className="my-auto w-full max-w-[560px] overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_35px_100px_rgba(15,23,42,0.45)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-500 px-5 py-5 text-white sm:px-6">
          <div className="absolute -left-16 -top-20 size-44 rounded-full bg-white/15 blur-xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="text-right">
              <p className="text-xs font-black text-emerald-100">د شرکت وصولي</p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">
                {editingReceipt
                  ? `د ${representativeName} وصولي اصلاح`
                  : `د ${representativeName} وصولي ثبت`}
              </h2>
              <p className="mt-1 text-xs font-bold text-emerald-50">
                تاریخ، مقدار او د مقابل لوري رسید نمبر اجباري دي.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15 text-xl transition hover:bg-white/25"
              aria-label="بندول"
            >
              <FiX />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="rounded-[18px] border border-emerald-100 bg-gradient-to-l from-emerald-50 to-white p-4 text-right">
            <p className="text-xs font-black text-emerald-700">موجود باقي حساب</p>
            <p className="mt-1 text-2xl font-black text-emerald-800">
              {money(remaining, currency)}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="تاریخ *">
              <input
                required
                type="date"
                className="field h-11"
                value={form.date}
                onChange={(event) =>
                  onChange({ ...form, date: event.target.value })
                }
              />
            </Field>

            <Field label={`مقدار (${currency}) *`}>
              <input
                required
                min="0.01"
                max={roundMoney(Number(remaining || 0) + Number(editingReceipt?.amount || 0)) || undefined}
                step="0.01"
                type="number"
                className="field h-11"
                value={form.amount}
                onChange={(event) =>
                  onChange({ ...form, amount: event.target.value })
                }
                placeholder="0.00"
              />
            </Field>
          </div>

          <Field label="د مقابل لوري رسید نمبر *">
            <input
              required
              className="field h-11"
              value={form.receipt_number}
              onChange={(event) =>
                onChange({ ...form, receipt_number: event.target.value })
              }
              placeholder="هماغه نمبر چې پیسې اخیستونکي درکړی"
            />
          </Field>

          <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-bold leading-5 text-blue-700">
            رسید نمبر سیستم پخپله نه جوړوي؛ د مقابل شرکت یا شخص لخوا
            درکړل شوی نمبر ولیکئ.
          </p>

          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 font-black text-slate-700 transition hover:bg-slate-200"
            >
              لغوه
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-4 font-black text-white shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiCheckCircle />
              {saving ? "ثبتېږي..." : editingReceipt ? "اصلاح ذخیره کړه" : "وصولي ثبت کړه"}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function DeleteReceiptModal({ receipt, currency, deleting, onClose, onConfirm }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onClose();
      }}
      role="presentation"
    >
      <div
        dir="rtl"
        className="w-full max-w-sm rounded-[24px] border border-white/80 bg-white p-5 text-center shadow-[0_30px_90px_rgba(15,23,42,0.45)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-red-50 text-xl text-red-600">
          <FiTrash2 />
        </span>
        <h3 className="mt-3 text-lg font-black text-slate-950">وصولي ډلیټ شي؟</h3>
        <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
          رسید {receipt?.receipt_number || "—"} · {money(receipt?.amount, currency)}
        </p>
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          د ډلیټ وروسته به د نماینده باقي حساب اتومات تازه شي.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 bg-slate-100 text-sm font-black text-slate-700 disabled:opacity-60"
          >
            لغوه
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 text-sm font-black text-white shadow-md shadow-red-500/20 disabled:opacity-60"
          >
            <FiTrash2 /> {deleting ? "ډلیټ کېږي..." : "ډلیټ"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SummaryCard({ title, value, caption, tone, icon: Icon }) {
  const tones = {
    blue: ["border-blue-100", "bg-blue-100 text-blue-700", "text-blue-700"],
    green: ["border-emerald-100", "bg-emerald-100 text-emerald-700", "text-emerald-700"],
    orange: ["border-orange-100", "bg-orange-100 text-orange-700", "text-orange-700"],
    purple: ["border-violet-100", "bg-violet-100 text-violet-700", "text-violet-700"],
  };
  const style = tones[tone] || tones.blue;
  return (
    <article className={`wms-summary-card min-w-0 rounded-[20px] border bg-white p-3.5 shadow-[0_15px_34px_rgba(15,23,42,0.13)] sm:p-4 ${style[0]}`}>
      <div className="flex items-center gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-sm sm:size-12 ${style[1]}`}>
          <Icon />
        </span>
        <div dir="rtl" className="min-w-0 flex-1 text-right">
          <p className="truncate text-xs font-black text-slate-700">{title}</p>
          <p className={`mt-1 truncate text-xl font-black sm:text-2xl ${style[2]}`}>{value}</p>
          <p className="wms-representative-summary-caption mt-1 truncate text-[10px] font-bold text-slate-400">{caption}</p>
        </div>
      </div>
    </article>
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

  if (report) {
    return (
      <div className="overflow-x-auto p-3">
        <div dir="rtl" className="min-w-[900px]">
          <div className="grid grid-cols-[140px_minmax(340px,1fr)_150px_150px_160px] items-center gap-1 rounded-xl bg-gradient-to-l from-blue-950 via-blue-800 to-blue-700 px-3 py-3 text-xs font-black text-white shadow-md">
            <div className="text-center">تاریخ</div>
            <div className="text-right">تفصیل</div>
            <div className="text-center">بقایه / Debit</div>
            <div className="text-center">وصولي / Credit</div>
            <div className="text-center">روان حساب</div>
          </div>
          <LedgerDesktopRows ledger={ledger} currency={currency} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sm:hidden px-2 pb-3">
        <div dir="rtl" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[62px_1fr_82px_88px] items-center bg-gradient-to-l from-blue-950 via-blue-800 to-blue-700 px-1.5 py-2 text-[9px] font-black text-white">
            <div className="text-center">تاریخ</div>
            <div className="text-right">تفصیل</div>
            <div className="text-center">مبلغ</div>
            <div className="text-center">باقي</div>
          </div>
          <div className="divide-y divide-slate-100">
            {ledger.map((entry) => {
              const isReceipt = entry.type === "receipt";
              const amount = isReceipt ? entry.credit : entry.debit;
              return (
                <div
                  key={`${entry.type}-${entry.id}`}
                  className="grid grid-cols-[62px_1fr_82px_88px] items-center px-1.5 py-2 text-[10px]"
                >
                  <div className="text-center font-black leading-4 text-slate-500">
                    {formatDate(entry.date)}
                  </div>
                  <div className="min-w-0 pr-1 text-right">
                    <p className="truncate font-black text-slate-800">{entry.description}</p>
                    <span
                      className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-black ${
                        isReceipt
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-orange-50 text-orange-700"
                      }`}
                    >
                      {isReceipt ? "وصولي" : "بقایه"}
                    </span>
                  </div>
                  <div className={`text-center font-black ${isReceipt ? "text-emerald-700" : "text-orange-700"}`}>
                    {money(amount, currency)}
                  </div>
                  <div className="text-center font-black text-blue-700">
                    {money(entry.running_balance, currency)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="hidden overflow-x-auto p-3 sm:block">
        <div dir="rtl" className="min-w-[980px]">
          <div className="grid grid-cols-[140px_minmax(340px,1fr)_150px_150px_160px] items-center gap-1 rounded-xl bg-gradient-to-l from-blue-950 via-blue-800 to-blue-700 px-3 py-3 text-xs font-black text-white shadow-md">
            <div className="text-center">تاریخ</div>
            <div className="text-right">تفصیل</div>
            <div className="text-center">بقایه / Debit</div>
            <div className="text-center">وصولي / Credit</div>
            <div className="text-center">روان حساب</div>
          </div>
          <LedgerDesktopRows ledger={ledger} currency={currency} />
        </div>
      </div>
    </div>
  );
}

function LedgerDesktopRows({ ledger, currency }) {
  return (
    <div className="mt-2 space-y-1.5">
      {ledger.map((entry) => (
        <div
          key={`${entry.type}-${entry.id}`}
          className="grid grid-cols-[140px_minmax(340px,1fr)_150px_150px_160px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
        >
          <div className="text-center text-xs font-black text-slate-600">
            {formatDate(entry.date)}
          </div>

          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-black text-slate-900">{entry.description}</p>
            <span
              className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${
                entry.type === "receipt"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-orange-50 text-orange-700"
              }`}
            >
              {entry.type === "receipt" ? "وصولي" : "بقایه"}
            </span>
          </div>

          <div className="text-center">
            <span className="inline-flex min-w-24 justify-center rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5 text-sm font-black text-orange-700">
              {entry.debit ? money(entry.debit, currency) : "—"}
            </span>
          </div>

          <div className="text-center">
            <span className="inline-flex min-w-24 justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm font-black text-emerald-700">
              {entry.credit ? money(entry.credit, currency) : "—"}
            </span>
          </div>

          <div className="text-center">
            <span className="inline-flex min-w-24 justify-center rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-sm font-black text-blue-700">
              {money(entry.running_balance, currency)}
            </span>
          </div>
        </div>
      ))}
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
