import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiBarChart2,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiDollarSign,
  FiDownload,
  FiEdit2,
  FiEye,
  FiFileText,
  FiMail,
  FiMapPin,
  FiPhone,
  FiPrinter,
  FiSend,
  FiTrash2,
  FiUser,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Loading from "../components/ui/Loading";
import Modal from "../components/ui/Modal";
import { getErrorMessage } from "../lib/api";
import { debtorService, settingsService } from "../Services/wmsService";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/format";
import { printElement } from "../utils/print";
import { can } from "../utils/permissions";
import { jsPDF } from "jspdf";

const MARKET_STORAGE_KEY = "wms-debtor-markets";

const DEFAULT_COMPANY = {
  company_name: "AZI SYSTEM",
  logo_url: "",
  address: "",
  phone: "",
  email: "",
  report_title: "د مشتري رسمي حسابي راپور",
  document_prefix: "DB",
  footer_text: "مننه چې زمونږ سره حساب کوئ",
  debtor_signature_label: "د د مشتري امضا",
  accountant_signature_label: "د محاسب امضا",
  stamp_label: "مهر او تایید",
  whatsapp_greeting: "السلام علیکم",
  whatsapp_request: "مهرباني وکړئ د فرصت په صورت کې خپل حساب تصفیه کړئ",
  whatsapp_closing: "مننه",
  watermark_enabled: true,
  watermark_logo_url: "",
  watermark_opacity: 0.06,
};

export default function DebtorDetailsPage() {
  const { profile } = useAuth();
  const canManage = can(profile, "debtors.manage");
  const { id } = useParams();
  const historyRef = useRef(null);

  const cachedDebtor = debtorService.peek?.(id);
  const cachedSettings = settingsService.peek?.();
  const [data, setData] = useState(() => cachedDebtor || null);
  const [company, setCompany] = useState(() => ({ ...DEFAULT_COMPANY, ...(cachedSettings?.company || {}) }));
  const [loading, setLoading] = useState(() => !cachedDebtor);
  const [showPayment, setShowPayment] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editingBalance, setEditingBalance] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteStep, setDeleteStep] = useState(0);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [testingWeeklyWhatsApp, setTestingWeeklyWhatsApp] = useState(false);
  const [testingFullWhatsApp, setTestingFullWhatsApp] = useState(false);
  const [whatsappConfirm, setWhatsAppConfirm] = useState(null);

  const load = useCallback(async () => {
    if (!debtorService.peek?.(id)) setLoading(true);
    try {
      const [debtorResult, settingsResult] = await Promise.all([
        debtorService.get(id),
        settingsService.get().catch(() => ({ company: {} })),
      ]);
      setData(debtorResult);
      setCompany({ ...DEFAULT_COMPANY, ...(settingsResult?.company || {}) });
    } catch (error) {
      toast.error(getErrorMessage(error, "د قرضدار معلومات ترلاسه نه شول."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const customer = data?.customer;
  // Keep debtor histories ordered by the selected transaction date, newest first.
  // Editing a record does not move it unless its actual Shamsi date is changed.
  const payments = useMemo(() => {
    const rows = data?.payments || customer?.payments || [];
    return [...rows].sort((a, b) =>
      compareDebtorHistoryDates(
        paymentHistoryShamsiDate(b),
        paymentHistoryShamsiDate(a),
        b?.created_at,
        a?.created_at,
      ),
    );
  }, [customer?.payments, data?.payments]);

  const balances = useMemo(() => {
    const rows =
      data?.balances ||
      customer?.balance_records ||
      (data?.invoices || customer?.invoices || []).map(invoiceToBalance);

    return [...rows].sort((a, b) =>
      compareDebtorHistoryDates(
        balanceHistoryShamsiDate(b),
        balanceHistoryShamsiDate(a),
        b?.created_at,
        a?.created_at,
      ),
    );
  }, [customer?.balance_records, customer?.invoices, data?.balances, data?.invoices]);

  const totals = useMemo(() => {
    const currentBalance = Number(
      customer?.current_balance ?? customer?.remaining_balance ?? 0,
    );
    const totalPaid = payments.reduce(
      (sum, item) => sum + Number(item?.amount || 0),
      0,
    );

    return {
      totalDebt: currentBalance + totalPaid,
      totalPaid,
      balance: currentBalance,
      balances: balances.length,
      payments: payments.length,
    };
  }, [balances.length, customer, payments]);

  if (loading) {
    return (
      <Card className="p-6">
        <Loading />
      </Card>
    );
  }

  if (!customer) {
    return (
      <Card className="p-6">
        <EmptyState title="قرضدار پیدا نه شو" />
      </Card>
    );
  }

  const currency = customer.currency || "AFN";

  const printReport = () => {
    setShowReport(true);
    window.setTimeout(() => {
      try {
        printElement("formal-debtor-report", `${customer.name} - راپور`);
      } catch (error) {
        toast.error(getErrorMessage(error, "راپور چاپ نه شو."));
      }
    }, 250);
  };

  const openWhatsAppConfirmation = ({ mode = "account-image", message, title, phone, receipt: receiptPayload }) => {
    const normalized = normalizeWhatsAppPhone(phone || customer.phone);
    if (!normalized) {
      toast.error("د قرضدار د واتساپ شمېره نشته.");
      return;
    }

    setWhatsAppConfirm({
      mode,
      phone: normalized,
      message,
      title: title || customer.name,
      receipt: receiptPayload || null,
    });
  };

  const shareWhatsApp = () => {
    openWhatsAppConfirmation({
      mode: "account-image",
      phone: customer.phone,
      title: customer.name,
      message: buildWhatsAppMessage({ company, customer, totals, currency }),
    });
  };

  const shareReportPdf = () => {
    openWhatsAppConfirmation({
      mode: "pdf",
      phone: customer.phone,
      title: customer.name,
      message: `${company.whatsapp_greeting || "السلام علیکم"}\nګرانه ${customer.name}\nستاسې رسمي حسابي راپور په PDF کې درسره شریک شو.\n${company.whatsapp_closing || "مننه"}`,
    });
  };

  const sendConfirmedWhatsApp = async () => {
    if (!whatsappConfirm) return;

    setSharingWhatsApp(true);

    try {
      if (whatsappConfirm.mode === "pdf") {
        const pdfBlob = await createReportPdfBlob({
          company,
          customer,
          totals,
          payments,
          balances,
          currency,
        });
        const fileName = `${safeFileName(customer.name)}-account-report.pdf`;
        const file = new File([pdfBlob], fileName, { type: "application/pdf" });
        await shareFileToWhatsApp({
          file,
          blob: pdfBlob,
          phone: whatsappConfirm.phone,
          message: whatsappConfirm.message,
          title: `${customer.name} - حسابي راپور`,
        });
      } else if (whatsappConfirm.mode === "receipt-image") {
        const receiptPayload = whatsappConfirm.receipt;
        if (!receiptPayload) throw new Error("د وصولي معلومات نشته.");
        const imageBlob = await createReceiptCardBlob({ company, receipt: receiptPayload });
        const fileName = `${safeFileName(receiptPayload.customer.name)}-payment-receipt.png`;
        const file = new File([imageBlob], fileName, { type: "image/png" });
        await shareFileToWhatsApp({
          file,
          blob: imageBlob,
          phone: whatsappConfirm.phone,
          message: whatsappConfirm.message,
          title: `${receiptPayload.customer.name} - د وصولي رسید`,
        });
      } else {
        const imageBlob = await createWhatsAppCardBlob({
          company,
          customer,
          totals,
          currency,
        });
        const fileName = `${safeFileName(customer.name)}-account-card.png`;
        const file = new File([imageBlob], fileName, { type: "image/png" });
        await shareFileToWhatsApp({
          file,
          blob: imageBlob,
          phone: whatsappConfirm.phone,
          message: whatsappConfirm.message,
          title: `${customer.name} - حساب`,
        });
      }

      setWhatsAppConfirm(null);
    } catch (error) {
      if (error?.name !== "AbortError") {
        toast.error(getErrorMessage(error, "واتساپ ته معلومات شریک نه شول."));
      }
    } finally {
      window.setTimeout(() => setSharingWhatsApp(false), 500);
    }
  };

  const sendWeeklyWhatsAppTest = async () => {
    if (!customer?.id) return toast.error("د قرضدار ID نشته.");
    if (!customer?.phone) return toast.error("د دې قرضدار WhatsApp نمبر نشته.");

    setTestingWeeklyWhatsApp(true);
    try {
      const result = await debtorService.sendWeeklyWhatsAppTest(customer.id);
      if (result?.skipped || result?.result?.skipped) {
        const reason = result?.reason || result?.result?.reason;
        if (reason === "balance_zero") return toast.error("د دې قرضدار پاتې حساب صفر دی.");
        if (reason === "missing_phone") return toast.error("د قرضدار WhatsApp نمبر نشته.");
        return toast.error("Weekly Test راپور ونه لېږل شو.");
      }
      toast.success(`د ${customer.name} Weekly Test راپور WhatsApp ته ولېږل شو.`);
    } catch (error) {
      console.error("Weekly WhatsApp test error:", error);
      toast.error(getErrorMessage(error, "Weekly Test راپور ونه لېږل شو."));
    } finally {
      setTestingWeeklyWhatsApp(false);
    }
  };

  const sendFullWhatsAppTest = async () => {
    if (!customer?.id) return toast.error("د قرضدار ID نشته.");
    if (!customer?.phone) return toast.error("د دې قرضدار WhatsApp نمبر نشته.");

    setTestingFullWhatsApp(true);
    try {
      const result = await debtorService.sendFullWhatsAppTest(customer.id);
      if (result?.skipped || result?.result?.skipped) {
        const reason = result?.reason || result?.result?.reason;
        if (reason === "missing_phone") return toast.error("د قرضدار WhatsApp نمبر نشته.");
        return toast.error("د ۳ هفتو PDF Test راپور ونه لېږل شو.");
      }
      toast.success(`د ${customer.name} د ۳ هفتو بشپړ PDF راپور WhatsApp ته ولېږل شو.`);
    } catch (error) {
      console.error("Full WhatsApp PDF test error:", error);
      toast.error(getErrorMessage(error, "د ۳ هفتو PDF Test راپور ونه لېږل شو."));
    } finally {
      setTestingFullWhatsApp(false);
    }
  };

  const goToHistory = () => {
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="page-enter min-w-0 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/debtors"
          className="secondary-button inline-flex h-11 items-center gap-2 rounded-xl px-4"
        >
          <FiArrowRight /> شاته
        </Link>

        <div dir="rtl" className="text-right">
          <p className="text-xs font-black text-blue-600">قرضداران</p>
          <h1 className="text-xl font-black text-slate-950 sm:text-2xl">
            د قرضدار جزییات
          </h1>
        </div>
      </div>

      <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-xl shadow-slate-900/10 sm:rounded-[34px]">
        <div className="wms-photo-hero relative min-h-[210px] overflow-hidden px-5 py-6 text-white sm:min-h-[230px] sm:px-8 sm:py-7" style={{ backgroundImage: "url('/header-images/header-daisy.jpeg')" }}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/78 via-blue-950/45 to-sky-900/18" />

          <button
            type="button"
            onClick={() => setShowEdit(true)}
            disabled={!canManage}
            className="absolute left-4 top-4 z-20 inline-flex h-11 items-center gap-2 rounded-2xl border border-white/40 bg-white/15 px-4 text-sm font-black text-white shadow-lg backdrop-blur-md transition hover:bg-white/25 disabled:hidden sm:left-6 sm:top-6"
          >
            <FiEdit2 /> ایډیټ
          </button>

          <div dir="rtl" className="relative z-10 flex min-h-[160px] flex-col items-center justify-center text-center sm:min-h-[175px]">
            <div className="relative flex size-20 items-center justify-center rounded-full border-4 border-white/30 bg-white text-3xl text-blue-700 shadow-2xl sm:size-24 sm:text-4xl">
              <FiUser />
              <span className="absolute -bottom-1 right-1 size-5 rounded-full border-4 border-white bg-emerald-500" />
            </div>

            <div className="mt-4 max-w-full rounded-full border border-white/25 bg-white/10 px-5 py-2 shadow-sm backdrop-blur-md">
              <h2 className="max-w-[85vw] truncate text-2xl font-black sm:text-4xl">{customer.name}</h2>
            </div>
            <p className="mt-3 flex items-center justify-center gap-2 text-base font-semibold text-blue-50 sm:text-xl">
              <FiPhone className="shrink-0" />
              <span dir="ltr">{customer.phone || "—"}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 px-3 pb-4 pt-3 sm:grid-cols-3 sm:gap-4 sm:px-6 sm:pb-7 sm:pt-4">
          <DetailsStatCard title="جمله حساب" value={formatCurrency(totals.totalDebt, currency)} caption="ټول ثبت شوی حساب" icon={FiFileText} tone="red" />
          <DetailsStatCard title="ټول وصولي" value={formatCurrency(totals.totalPaid, currency)} caption="ټولې ترلاسه شوې پیسې" icon={FiCheckCircle} tone="green" />
          <DetailsStatCard className="col-span-2 sm:col-span-1" title="موجوده قرض" value={formatCurrency(totals.balance, currency)} caption="اوسنی پاتې حساب" icon={FiCreditCard} tone="blue" />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-3 shadow-lg shadow-slate-900/5 sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setShowPayment(true)}
            disabled={!canManage || totals.balance <= 0}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-500 px-3 text-base font-black text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-16 sm:text-xl"
          >
            <FiCreditCard className="text-xl sm:text-2xl" /> ثبت وصولي
          </button>

          <button
            type="button"
            onClick={() => setShowBalance(true)}
            disabled={!canManage}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 to-cyan-500 px-3 text-base font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-16 sm:text-xl"
          >
            <FiFileText className="text-xl sm:text-2xl" /> باقیات
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <SmallActionButton label="راپور" icon={FiBarChart2} onClick={() => setShowReport(true)} tone="blue" />
          <SmallActionButton label="پرنټ" icon={FiPrinter} onClick={printReport} tone="slate" />
          <SmallActionButton label={sharingWhatsApp ? "جوړېږي..." : "واتساپ"} icon={FaWhatsapp} onClick={shareWhatsApp} tone="green" disabled={sharingWhatsApp} />
          <SmallActionButton label={testingWeeklyWhatsApp ? "لېږل کېږي..." : "Weekly Test"} icon={FiSend} onClick={sendWeeklyWhatsAppTest} tone="blue" disabled={testingWeeklyWhatsApp || !customer?.phone} />
          <SmallActionButton label={testingFullWhatsApp ? "PDF لېږل کېږي..." : "۳ هفتو PDF"} icon={FiFileText} onClick={sendFullWhatsAppTest} tone="blue" disabled={testingFullWhatsApp || !customer?.phone} />
          <SmallActionButton label="History" icon={FiClock} onClick={goToHistory} tone="purple" />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4">
        <DetailItem icon={FiPhone} label="موبایل نمبر" value={customer.phone || "—"} tone="blue" />
        <DetailItem icon={FiMapPin} label="پته" value={customer.address || "—"} tone="orange" />
      </section>

      <section ref={historyRef} id="history-section" className="grid gap-4">
        <HistoryCard title="د وصولي تاریخچه" icon={FiCreditCard} count={payments.length} tone="green">
          {payments.length ? <PaymentHistory rows={payments} currency={currency} canManage={canManage} onEdit={setEditingPayment} onDelete={(row) => { setDeleteTarget({ type: "payment", row }); setDeleteStep(1); }} /> : <EmptyState title="وصولي نشته" />}
        </HistoryCard>

        <HistoryCard title="باقیات" icon={FiFileText} count={balances.length} tone="blue">
          {balances.length ? <BalanceHistory rows={balances} currency={currency} canManage={canManage} onEdit={setEditingBalance} onDelete={(row) => { setDeleteTarget({ type: "balance", row }); setDeleteStep(1); }} /> : <EmptyState title="باقیات نشته" />}
        </HistoryCard>
      </section>

      <PageWatermark company={company} />

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="د قرضدار معلومات ایډیټ" size="sm">
        <CustomerEditForm
          customer={customer}
          onCancel={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            load();
          }}
        />
      </Modal>

      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="ثبت وصولي" size="sm">
        <PaymentForm
          customer={customer}
          max={totals.balance}
          onSaved={(result) => {
            const payment = result?.payment || {};
            const updatedCustomer = result?.customer || customer;
            setShowPayment(false);
            setReceipt({
              customer: updatedCustomer,
              amount: Number(payment.amount || 0),
              amount_words: payment.amount_words || numberToPashto(payment.amount),
              remaining_balance: Number(updatedCustomer?.current_balance || 0),
              date: payment.payment_date_shamsi || payment.payment_date,
              method: payment.method,
              hawala_number: payment.hawala_number,
              market: payment.market,
              shop_address: payment.shop_address,
            });
            load();
          }}
        />
      </Modal>

      <Modal open={showBalance} onClose={() => setShowBalance(false)} title="باقیات" size="sm">
        <BalanceForm
          customer={customer}
          onSaved={() => {
            setShowBalance(false);
            load();
          }}
        />
      </Modal>

      <Modal open={Boolean(editingPayment)} onClose={() => setEditingPayment(null)} title="وصولي ایډیټ" size="sm">
        {editingPayment ? <PaymentEditForm customer={customer} payment={editingPayment} onSaved={async () => { setEditingPayment(null); await load(); }} /> : null}
      </Modal>

      <Modal open={Boolean(editingBalance)} onClose={() => setEditingBalance(null)} title="باقیات ایډیټ" size="sm">
        {editingBalance ? <BalanceEditForm customer={customer} record={editingBalance} onSaved={async () => { setEditingBalance(null); await load(); }} /> : null}
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => { if (!deletingRecord) { setDeleteTarget(null); setDeleteStep(0); } }} title="ریکارډ ډلیټ" size="sm">
        {deleteTarget ? (
          <div dir="rtl" className="space-y-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-50 text-xl text-red-600"><FiTrash2 /></div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                {deleteStep === 1 ? "ایا دا ریکارډ ډلیټ کول غواړې؟" : "وروستی تایید"}
              </h3>
              <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
                {deleteStep === 1
                  ? "د ډلیټ وروسته به د قرضدار حساب هم سم او اتومات تازه شي."
                  : "دا عمل بېرته نه راګرځي. د ډلیټ لپاره یو ځل بیا تایید کړه."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" disabled={deletingRecord} onClick={() => { setDeleteTarget(null); setDeleteStep(0); }}>لغوه</Button>
              {deleteStep === 1 ? (
                <Button type="button" onClick={() => setDeleteStep(2)}><FiTrash2 /> دوام</Button>
              ) : (
                <Button
                  type="button"
                  disabled={deletingRecord}
                  onClick={async () => {
                    setDeletingRecord(true);
                    try {
                      if (deleteTarget.type === "payment") await debtorService.deletePayment(id, deleteTarget.row.id);
                      else await debtorService.deleteBalance(id, deleteTarget.row.id);
                      toast.success("ریکارډ ډلیټ شو او حساب تازه شو.");
                      setDeleteTarget(null);
                      setDeleteStep(0);
                      await load();
                    } catch (error) {
                      toast.error(getErrorMessage(error, "ریکارډ ډلیټ نه شو."));
                    } finally {
                      setDeletingRecord(false);
                    }
                  }}
                >
                  <FiTrash2 /> {deletingRecord ? "ډلیټ کېږي..." : "هو، ډلیټ یې کړه"}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={showReport} onClose={() => setShowReport(false)} title="د قرضدار راپور" size="xl">
        <FormalReport
          customer={customer}
          totals={totals}
          currency={currency}
          payments={payments}
          balances={balances}
          company={company}
          onPrint={printReport}
          onSharePdf={shareReportPdf}
          sharingPdf={sharingWhatsApp}
        />
      </Modal>

      <Modal open={Boolean(receipt)} onClose={() => setReceipt(null)} title="د وصولي رسید" size="sm">
        {receipt ? (
          <PaymentReceipt
            receipt={receipt}
            onClose={() => setReceipt(null)}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(whatsappConfirm)}
        onClose={() => setWhatsAppConfirm(null)}
        title="واتساپ ته لېږل"
        size="sm"
      >
        {whatsappConfirm ? (
          <WhatsAppConfirmation
            customerName={whatsappConfirm.title}
            phone={whatsappConfirm.phone}
            mode={whatsappConfirm.mode || "text"}
            sending={sharingWhatsApp}
            onCancel={() => setWhatsAppConfirm(null)}
            onConfirm={sendConfirmedWhatsApp}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function DebtorHeroArtwork() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.18),transparent_25%),radial-gradient(circle_at_80%_80%,rgba(14,165,233,0.28),transparent_35%)]" />
      <div className="absolute -left-12 -top-14 size-52 rounded-full border border-white/15 bg-white/10 blur-sm" />
      <div className="absolute -bottom-20 right-1/3 size-52 rounded-full bg-blue-950/20 blur-3xl" />
      <svg viewBox="0 0 760 250" className="absolute inset-y-0 left-0 h-full w-[72%] opacity-55 sm:w-[58%] sm:opacity-85 lg:w-[48%]" aria-hidden="true">
        <g opacity="0.28" stroke="#dbeafe" strokeWidth="1.5">
          <path d="M45 72L150 30L260 70L365 26L485 72L600 35L720 78" fill="none" />
          <path d="M45 190L150 150L260 188L370 138L488 188L605 145L720 188" fill="none" />
        </g>
        <g transform="translate(100 42)">
          <rect x="0" y="20" width="250" height="145" rx="24" fill="#ffffff" fillOpacity="0.12" stroke="#fff" strokeOpacity="0.28" />
          <rect x="28" y="47" width="70" height="70" rx="18" fill="#fff" fillOpacity="0.16" />
          <circle cx="63" cy="70" r="13" fill="#fff" fillOpacity="0.75" />
          <path d="M42 103c7-24 37-24 43 0" fill="#fff" fillOpacity="0.75" />
          <rect x="122" y="50" width="92" height="11" rx="6" fill="#fff" fillOpacity="0.68" />
          <rect x="122" y="76" width="72" height="8" rx="4" fill="#fff" fillOpacity="0.38" />
        </g>
      </svg>
    </div>
  );
}

function DetailsStatCard({ title, value, caption, icon: Icon, tone, className = "" }) {
  const tones = {
    red: { icon: "bg-red-100 text-red-600", value: "text-red-600", border: "border-red-100" },
    green: { icon: "bg-emerald-100 text-emerald-700", value: "text-emerald-700", border: "border-emerald-100" },
    blue: { icon: "bg-blue-100 text-blue-700", value: "text-blue-700", border: "border-blue-100" },
    purple: { icon: "bg-violet-100 text-violet-700", value: "text-violet-700", border: "border-violet-100" },
  };
  const style = tones[tone] || tones.blue;
  return (
    <article className={`wms-summary-card ${className} min-w-0 rounded-[18px] border ${style.border} bg-white p-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.09)] sm:rounded-[26px] sm:p-5 sm:shadow-[0_14px_32px_rgba(15,23,42,0.10)]`}>
      <div className="flex items-center gap-2 sm:gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-base shadow-sm sm:size-14 sm:rounded-2xl sm:text-2xl ${style.icon}`}><Icon /></span>
        <div dir="rtl" className="min-w-0 flex-1 text-right">
          <p className="truncate text-[10px] font-black text-slate-700 sm:text-sm">{title}</p>
          <p className={`mt-0.5 truncate text-base font-black sm:mt-1 sm:text-2xl ${style.value}`}>{value}</p>
          <p className="mt-0.5 hidden truncate text-[10px] font-bold text-slate-500 sm:mt-1 sm:block sm:text-xs">{caption}</p>
        </div>
      </div>
    </article>
  );
}

function SmallActionButton({ label, icon: Icon, onClick, tone, disabled = false }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
    slate: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    purple: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black shadow-sm transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60 sm:h-12 ${tones[tone] || tones.slate}`}>
      <Icon className="text-lg" /> {label}
    </button>
  );
}

function DetailItem({ icon: Icon, label, value, tone }) {
  const tones = {
    blue: "bg-blue-100 text-blue-700",
    orange: "bg-orange-100 text-orange-600",
    purple: "bg-violet-100 text-violet-700",
    green: "bg-emerald-100 text-emerald-700",
  };
  return (
    <Card className="min-w-0 p-2.5 sm:p-5">
      <div dir="rtl" className="flex items-center gap-2 text-right sm:gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-base sm:size-11 sm:rounded-2xl sm:text-xl ${tones[tone] || tones.blue}`}><Icon /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-black text-slate-500 sm:text-xs">{label}</p>
          <p className="mt-0.5 truncate text-xs font-black text-slate-950 sm:mt-1 sm:text-base">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function HistoryCard({ title, icon: Icon, count, tone, children }) {
  const green = tone === "green";
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div dir="rtl" className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-3">
          <span className={`flex size-9 items-center justify-center rounded-xl text-base sm:size-10 sm:rounded-2xl sm:text-lg ${green ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}><Icon /></span>
          <h2 className="text-base font-black text-slate-950 sm:text-xl">{title}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black sm:px-3 sm:text-xs ${green ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{count} Records</span>
      </div>
      <div className="p-2.5 sm:p-5">{children}</div>
    </Card>
  );
}

function PaymentHistory({ rows, currency, canManage, onEdit, onDelete }) {
  return (
    <div className="min-w-0 space-y-2">
      {rows.map((row) => {
        const isHawala = row.method === "hawala" || row.method === "bank";
        return (
          <article
            key={row.id}
            dir="rtl"
            className="grid min-w-0 gap-2 rounded-[16px] border border-emerald-200 bg-gradient-to-l from-emerald-50 via-white to-white px-3 py-2.5 text-right shadow-[0_7px_18px_rgba(5,150,105,0.08)] sm:grid-cols-[minmax(0,1fr)_minmax(150px,auto)_auto] sm:items-center sm:gap-3 sm:px-4"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-black text-emerald-600">وصولي</p>
              <p className="mt-0.5 truncate text-lg font-black text-emerald-700 sm:text-xl">
                {formatCurrency(row.amount, currency)}
              </p>
            </div>

            <div className="min-w-0 rounded-xl border border-emerald-100 bg-white/90 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-black text-slate-500 sm:text-xs">
                <span>
                  طریقه:
                  <b className={isHawala ? "mr-1 text-blue-700" : "mr-1 text-emerald-700"}>
                    {paymentMethodLabel(row.method)}
                  </b>
                </span>

                {isHawala ? (
                  <>
                    <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">
                      حواله نمبر:
                      <b className="mr-1 text-slate-900">
                        {row.hawala_number || "—"}
                      </b>
                    </span>

                    <span className="rounded-lg bg-violet-50 px-2 py-1 text-violet-700">
                      مارکیت:
                      <b className="mr-1 text-slate-900">
                        {row.market || "—"}
                      </b>
                    </span>

                    <span className="max-w-full rounded-lg bg-amber-50 px-2 py-1 text-amber-700">
                      دوکان ادرس:
                      <b className="mr-1 break-words text-slate-900">
                        {row.shop_address || "—"}
                      </b>
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 justify-self-start sm:justify-self-end">
              <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-600 shadow-sm">
                {displayHistoryDate(paymentHistoryShamsiDate(row))}
              </span>
              {canManage ? (
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => onEdit(row)} className="flex size-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 shadow-sm" title="ایډیټ"><FiEdit2 /></button>
                  <button type="button" onClick={() => onDelete(row)} className="flex size-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 shadow-sm" title="ډلیټ"><FiTrash2 /></button>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function BalanceHistory({ rows, currency, canManage, onEdit, onDelete }) {
  return (
    <div className="min-w-0 space-y-2">
      {rows.map((row) => {
        const amount = row.amount ?? row.total_amount;
        return (
          <article
            key={row.id}
            dir="rtl"
            className="grid min-w-0 gap-2 rounded-[16px] border border-blue-200 bg-gradient-to-l from-blue-50 via-white to-white px-3 py-2.5 text-right shadow-[0_7px_18px_rgba(37,99,235,0.08)] sm:grid-cols-[minmax(0,1fr)_minmax(150px,auto)_auto] sm:items-center sm:gap-3 sm:px-4"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-black text-blue-600">باقیات</p>
              <p className="mt-0.5 truncate text-lg font-black text-red-600 sm:text-xl">
                {formatCurrency(amount, currency)}
              </p>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white/90 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-400">بل نمبر</p>
                <p className="truncate text-xs font-black text-slate-800">{row.bill_number || "—"}</p>
              </div>
              {row.bill_image ? (
                <a
                  href={row.bill_image}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-blue-700 to-cyan-500 px-2.5 text-[10px] font-black text-white shadow-sm"
                >
                  <FiEye /> عکس
                </a>
              ) : null}
            </div>

            <div className="flex items-center gap-2 justify-self-start sm:justify-self-end">
              <span className="whitespace-nowrap rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-600 shadow-sm">
                {displayHistoryDate(balanceHistoryShamsiDate(row))}
              </span>
              {canManage ? (
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => onEdit(row)} className="flex size-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 shadow-sm" title="ایډیټ"><FiEdit2 /></button>
                  <button type="button" onClick={() => onDelete(row)} className="flex size-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 shadow-sm" title="ډلیټ"><FiTrash2 /></button>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MiniInfo({ label, value, tone = "blue", wide = false }) {
  const colors = {
    green: "border-emerald-100 bg-white text-emerald-700",
    blue: "border-blue-100 bg-white text-blue-700",
  };
  return (
    <div className={`min-w-0 rounded-xl border p-2 shadow-sm sm:rounded-2xl sm:p-3 ${colors[tone] || colors.blue} ${wide ? "w-full" : ""}`}>
      <p className="text-[9px] font-bold text-slate-500 sm:text-[10px]">{label}</p>
      <p className="mt-0.5 break-words text-xs font-black text-slate-900 sm:mt-1 sm:text-sm">{value}</p>
    </div>
  );
}

function CustomerEditForm({ customer, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: customer.name || "",
    phone: customer.phone || "",
    address: customer.address || "",
    currency: customer.currency || "AFN",
    current_balance: Number(customer.current_balance || customer.remaining_balance || 0),
    notes: customer.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return toast.error("نوم ضروري دی.");
    if (!form.phone.trim()) return toast.error("موبایل نمبر ولیکئ.");

    setSaving(true);
    try {
      await debtorService.update(customer.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        currency: form.currency,
        current_balance: Math.max(0, Number(form.current_balance || 0)),
        remaining_balance: Math.max(0, Number(form.current_balance || 0)),
        notes: form.notes.trim(),
      });
      toast.success("د قرضدار معلومات تازه شول.");
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-4">
      <div className="rounded-[26px] border border-blue-100 bg-gradient-to-l from-blue-50 via-white to-cyan-50 p-5 shadow-inner">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-blue-600">د مشتری حساب</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">معلومات ایډیټ</h3>
          </div>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg">
            <FiEdit2 />
          </span>
        </div>
      </div>

      <EditField label="نوم" icon={FiUser}>
        <input className="field h-12 rounded-2xl bg-slate-50/70 font-bold" value={form.name} onChange={(event) => change("name", event.target.value)} />
      </EditField>

      <div className="grid gap-4 sm:grid-cols-2">
        <EditField label="موبایل نمبر" icon={FiPhone}>
          <input dir="ltr" className="field h-12 rounded-2xl bg-slate-50/70 font-bold" value={form.phone} onChange={(event) => change("phone", event.target.value)} />
        </EditField>
        <EditField label="کرنسي" icon={FiDollarSign}>
          <select className="field h-12 rounded-2xl bg-slate-50/70 font-black" value={form.currency} onChange={(event) => change("currency", event.target.value)}>
            <option value="AFN">AFN — افغانۍ</option>
            <option value="USD">USD — ډالر</option>
          </select>
        </EditField>
      </div>

      <EditField label="ادرس" icon={FiMapPin}>
        <input className="field h-12 rounded-2xl bg-slate-50/70 font-bold" value={form.address} onChange={(event) => change("address", event.target.value)} />
      </EditField>

      <EditField label="اوسنی حساب" icon={FiCreditCard}>
        <input
          type="number"
          min="0"
          className="field h-12 rounded-2xl bg-slate-50/70 font-black"
          value={form.current_balance}
          onChange={(event) => change("current_balance", event.target.value)}
        />
      </EditField>

      <EditField label="نوټ" icon={FiFileText}>
        <textarea rows={3} className="textarea-field min-h-24 rounded-2xl bg-slate-50/70 font-semibold" value={form.notes} onChange={(event) => change("notes", event.target.value)} />
      </EditField>

      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>لغوه</Button>
        <Button type="submit" disabled={saving}><FiEdit2 /> {saving ? "خوندي کېږي..." : "خوندي کول"}</Button>
      </div>
    </form>
  );
}

function EditField({ label, icon: Icon, children }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-black text-slate-700"><Icon className="text-blue-600" />{label}</span>
      {children}
    </label>
  );
}

function PaymentForm({ customer, max, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    amount: "",
    method: "cash",
    payment_date: today,
    payment_date_shamsi: formatShamsi(today),
    hawala_number: "",
    market: "",
    shop_address: "",
  });
  const [markets, setMarkets] = useState(loadMarketSuggestions);
  const [saving, setSaving] = useState(false);
  const amountWords = numberToPashto(form.amount);
  const isHawala = form.method === "hawala";

  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount || 0);
    if (amount <= 0 || amount > max) {
      toast.error("د وصولي مبلغ سم ولیکئ.");
      return;
    }
    if (isHawala && !form.hawala_number.trim()) {
      toast.error("حواله نمبر ولیکئ.");
      return;
    }

    setSaving(true);
    try {
      const paymentDate = today;
      const payload = {
        ...form,
        amount,
        amount_words: amountWords,
        payment_date: paymentDate,
        payment_date_shamsi: form.payment_date_shamsi,
        market: isHawala ? form.market.trim() : "",
        hawala_number: isHawala ? form.hawala_number.trim() : "",
        shop_address: isHawala ? form.shop_address.trim() : "",
      };

      if (isHawala && payload.market) {
        const nextMarkets = saveMarketSuggestion(payload.market, markets);
        setMarkets(nextMarkets);
      }

      const result = await debtorService.payment(customer.id, payload);
      toast.success("وصولي ثبت شوه.");
      onSaved(result);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-4">
      <div className="overflow-hidden rounded-[26px] bg-gradient-to-l from-emerald-700 via-green-600 to-cyan-500 p-5 text-white shadow-lg shadow-emerald-700/20">
        <p className="text-sm font-black text-emerald-100">اوسنی باقي قرض</p>
        <p className="mt-1 text-3xl font-black">{formatCurrency(max, customer.currency)}</p>
        <p className="mt-2 text-xs font-bold text-emerald-50">د وصولي معلومات په دقیق ډول ثبت کړئ</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="مقدار">
          <input type="number" min="1" max={max} className="field" placeholder="مثلاً 20000" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        </Field>
        <Field label="مقدار په پښتو">
          <input className="field bg-blue-50 font-black text-blue-700" value={amountWords} readOnly placeholder="اتومات لیکل کېږي" />
        </Field>
      </div>

      <Field label="طریقه">
        <div className="grid grid-cols-2 gap-3">
          <ChoiceButton active={form.method === "cash"} onClick={() => setForm({ ...form, method: "cash" })} label="نقده" tone="green" />
          <ChoiceButton active={isHawala} onClick={() => setForm({ ...form, method: "hawala" })} label="حواله" tone="blue" />
        </div>
      </Field>

      {isHawala ? (
        <div className="rounded-[24px] border border-blue-100 bg-blue-50/60 p-4 shadow-inner">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نېټه">
              <input type="text" inputMode="numeric" className="field" dir="ltr" placeholder="1405/06/30" value={form.payment_date_shamsi} onChange={(event) => setForm({ ...form, payment_date_shamsi: normalizeShamsiInput(event.target.value) })} />
            </Field>
            <Field label="حواله نمبر">
              <input className="field" value={form.hawala_number} onChange={(event) => setForm({ ...form, hawala_number: event.target.value })} />
            </Field>
            <Field label="مارکیت">
              <input list="debtor-market-options" className="field" value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value })} placeholder="مارکیت ولیکئ یا انتخاب کړئ" />
              <datalist id="debtor-market-options">
                {markets.map((market) => <option key={market} value={market} />)}
              </datalist>
            </Field>
            <Field label="دوکان ادرس">
              <input className="field" value={form.shop_address} onChange={(event) => setForm({ ...form, shop_address: event.target.value })} />
            </Field>
          </div>
          <p className="mt-3 text-xs font-bold text-blue-600">هجري شمسي: {form.payment_date_shamsi}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
          <span className="block mb-2">هجري شمسي تاریخ</span><input type="text" inputMode="numeric" className="field bg-white text-slate-900" dir="ltr" placeholder="1405/06/30" value={form.payment_date_shamsi} onChange={(event) => setForm({ ...form, payment_date_shamsi: normalizeShamsiInput(event.target.value) })} />
        </div>
      )}

      <Button type="submit" variant="success" className="h-[52px] w-full rounded-2xl" disabled={saving}>
        <FiCreditCard /> {saving ? "ثبتېږي..." : "ثبت وصولي"}
      </Button>
    </form>
  );
}

function BalanceForm({ customer, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState("");
  const [form, setForm] = useState({
    bill_number: "",
    amount: "",
    bill_image: "",
    bill_image_name: "",
    note: "",
    date: today,
    date_shamsi: formatShamsi(today),
  });
  const [saving, setSaving] = useState(false);
  const amountWords = numberToPashto(form.amount);

  const readBillImage = (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("د عکس اندازه باید له 2MB کمه وي.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, bill_image: reader.result, bill_image_name: file.name }));
    reader.readAsDataURL(file);
  };

  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount || 0);
    if (!type) {
      toast.error("نقل بل یا درک مال انتخاب کړئ.");
      return;
    }
    if (amount <= 0) {
      toast.error("مقدار سم ولیکئ.");
      return;
    }
    if (type === "bill_transfer" && !form.bill_number.trim()) {
      toast.error("د بل نمبر ولیکئ.");
      return;
    }

    setSaving(true);
    try {
      const result = await debtorService.balance(customer.id, {
        type,
        amount,
        amount_words: amountWords,
        bill_number: type === "bill_transfer" ? form.bill_number.trim() : "",
        bill_image: type === "bill_transfer" ? form.bill_image : "",
        bill_image_name: type === "bill_transfer" ? form.bill_image_name : "",
        note: type === "goods_credit" ? form.note.trim() : "",
        date: today,
        date_shamsi: form.date_shamsi,
      });
      toast.success("باقیات ثبت شول.");
      onSaved(result);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-4">
      <div className="rounded-[26px] bg-gradient-to-l from-blue-800 via-blue-600 to-cyan-500 p-5 text-white shadow-lg shadow-blue-700/20">
        <p className="text-sm font-black text-blue-100">نوی باقیات ثبت کړئ</p>
        <p className="mt-1 text-2xl font-black">{customer.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ChoiceButton active={type === "bill_transfer"} onClick={() => setType("bill_transfer")} label="نقل بل" tone="blue" />
        <ChoiceButton active={type === "goods_credit"} onClick={() => setType("goods_credit")} label="درک مال" tone="orange" />
      </div>

      {!type ? (
        <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-black text-slate-500">
          لومړی یو اپشن انتخاب کړئ
        </div>
      ) : null}

      {type === "bill_transfer" ? (
        <div className="space-y-4 rounded-[24px] border border-blue-100 bg-blue-50/60 p-4">
          <Field label="هجري شمسي تاریخ"><input type="text" inputMode="numeric" className="field" dir="ltr" placeholder="1405/06/30" value={form.date_shamsi} onChange={(event) => setForm({ ...form, date_shamsi: normalizeShamsiInput(event.target.value) })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نمبر بل">
              <input className="field" value={form.bill_number} onChange={(event) => setForm({ ...form, bill_number: event.target.value })} />
            </Field>
            <Field label="مقدار">
              <input type="number" min="1" className="field" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </Field>
          </div>
          <Field label="مقدار په پښتو">
            <input className="field bg-blue-50 font-black text-blue-700" value={amountWords} readOnly placeholder="اتومات لیکل کېږي" />
          </Field>
          <Field label="عکس بل">
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-white px-4 text-center font-black text-blue-700 transition hover:bg-blue-50">
              <FiFileText className="mb-2 text-2xl" />
              {form.bill_image_name || "د بل عکس انتخاب کړئ"}
              <input type="file" accept="image/*" className="hidden" onChange={(event) => readBillImage(event.target.files?.[0])} />
            </label>
          </Field>
        </div>
      ) : null}

      {type === "goods_credit" ? (
        <div className="space-y-4 rounded-[24px] border border-orange-100 bg-orange-50/60 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="تاریخ">
              <input type="text" inputMode="numeric" className="field" dir="ltr" placeholder="1405/06/30" value={form.date_shamsi} onChange={(event) => setForm({ ...form, date_shamsi: normalizeShamsiInput(event.target.value) })} />
            </Field>
            <Field label="مقدار">
              <input type="number" min="1" className="field" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </Field>
          </div>
          <Field label="مقدار په پښتو">
            <input className="field bg-orange-50 font-black text-orange-700" value={amountWords} readOnly placeholder="اتومات لیکل کېږي" />
          </Field>
          <Field label="نوټ">
            <textarea className="textarea-field" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </Field>
        </div>
      ) : null}

      {type ? (
        <Button type="submit" className="h-[52px] w-full rounded-2xl" disabled={saving}>
          <FiFileText /> {saving ? "ثبتېږي..." : "باقیات ثبت کړه"}
        </Button>
      ) : null}
    </form>
  );
}


function PaymentEditForm({ customer, payment, onSaved }) {
  const [form, setForm] = useState({
    amount: String(payment.amount || ""),
    method: payment.method === "hawala" || payment.method === "bank" ? "hawala" : "cash",
    payment_date: payment.payment_date || new Date().toISOString().slice(0, 10),
    payment_date_shamsi: payment.payment_date_shamsi || formatShamsi(payment.payment_date || new Date()),
    hawala_number: payment.hawala_number || "",
    market: payment.market || "",
    shop_address: payment.shop_address || "",
  });
  const [saving, setSaving] = useState(false);
  const amountWords = numberToPashto(form.amount);
  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount || 0);
    if (amount <= 0) return toast.error("د وصولي مبلغ سم ولیکئ.");
    setSaving(true);
    try {
      await debtorService.updatePayment(customer.id, payment.id, { ...form, amount, amount_words: amountWords, payment_date_shamsi: form.payment_date_shamsi });
      toast.success("وصولي اصلاح شوه او حساب تازه شو.");
      await onSaved();
    } catch (error) { toast.error(getErrorMessage(error)); } finally { setSaving(false); }
  };
  return <form dir="rtl" onSubmit={submit} className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="مقدار"><input type="number" min="1" className="field" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></Field><Field label="هجري شمسي تاریخ"><input type="text" inputMode="numeric" className="field" dir="ltr" placeholder="1405/06/30" value={form.payment_date_shamsi} onChange={e=>setForm({...form,payment_date_shamsi:normalizeShamsiInput(e.target.value)})}/></Field></div>
    <Field label="طریقه"><div className="grid grid-cols-2 gap-2"><ChoiceButton active={form.method==="cash"} onClick={()=>setForm({...form,method:"cash"})} label="نقده" tone="green"/><ChoiceButton active={form.method==="hawala"} onClick={()=>setForm({...form,method:"hawala"})} label="حواله" tone="blue"/></div></Field>
    {form.method==="hawala" ? <div className="grid gap-3 sm:grid-cols-2"><Field label="حواله نمبر"><input className="field" value={form.hawala_number} onChange={e=>setForm({...form,hawala_number:e.target.value})}/></Field><Field label="مارکیت"><input className="field" value={form.market} onChange={e=>setForm({...form,market:e.target.value})}/></Field><Field label="دوکان ادرس"><input className="field" value={form.shop_address} onChange={e=>setForm({...form,shop_address:e.target.value})}/></Field></div> : null}
    <Button type="submit" className="w-full" disabled={saving}><FiEdit2 /> {saving ? "خوندي کېږي..." : "اصلاح خوندي کړه"}</Button>
  </form>;
}

function BalanceEditForm({ customer, record, onSaved }) {
  const [form, setForm] = useState({ amount: String(record.amount ?? record.total_amount ?? ""), date: record.record_date || record.date || new Date().toISOString().slice(0,10), date_shamsi: record.date_shamsi || formatShamsi(record.record_date || record.date || new Date()), bill_number: record.bill_number || "", note: record.note || "", type: record.type || "bill_transfer" });
  const [saving,setSaving]=useState(false);
  const submit=async(event)=>{event.preventDefault(); const amount=Number(form.amount||0); if(amount<=0)return toast.error("مقدار سم ولیکئ."); setSaving(true); try{await debtorService.updateBalance(customer.id,record.id,{...form,amount,amount_words:numberToPashto(amount),date_shamsi:form.date_shamsi}); toast.success("باقیات اصلاح شول او حساب تازه شو."); await onSaved();}catch(error){toast.error(getErrorMessage(error));}finally{setSaving(false);}};
  return <form dir="rtl" onSubmit={submit} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="مقدار"><input type="number" min="1" className="field" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></Field><Field label="هجري شمسي تاریخ"><input type="text" inputMode="numeric" className="field" dir="ltr" placeholder="1405/06/30" value={form.date_shamsi} onChange={e=>setForm({...form,date_shamsi:normalizeShamsiInput(e.target.value)})}/></Field></div>{form.type==="bill_transfer"?<Field label="بل نمبر"><input className="field" value={form.bill_number} onChange={e=>setForm({...form,bill_number:e.target.value})}/></Field>:<Field label="نوټ"><textarea className="textarea-field" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></Field>}<Button type="submit" className="w-full" disabled={saving}><FiEdit2 /> {saving?"خوندي کېږي...":"اصلاح خوندي کړه"}</Button></form>;
}

function ChoiceButton({ active, onClick, label, tone }) {
  const activeTone = tone === "green"
    ? "border-emerald-500 bg-emerald-600 text-white shadow-emerald-600/20"
    : tone === "orange"
      ? "border-orange-500 bg-orange-500 text-white shadow-orange-500/20"
      : "border-blue-500 bg-blue-600 text-white shadow-blue-600/20";
  return (
    <button type="button" onClick={onClick} className={`h-12 rounded-2xl border-2 text-base font-black shadow-lg transition ${active ? activeTone : "border-slate-200 bg-white text-slate-600 shadow-slate-900/5 hover:border-blue-200"}`}>
      {label}
    </button>
  );
}

function FormalReport({
  customer,
  totals,
  currency,
  payments,
  balances,
  company,
  onPrint,
  onSharePdf,
  sharingPdf,
}) {
  const documentNumber = `${company.document_prefix || "DB"}-${String(customer.id || "").slice(-6)}`;

  return (
    <div dir="rtl" className="min-w-0 space-y-4">
      <div className="w-full min-w-0 overflow-hidden rounded-[24px] bg-slate-100 p-1 sm:p-3">
        <div
          id="formal-debtor-report"
          className="relative mx-auto w-full min-w-0 max-w-none overflow-hidden border-4 border-double border-blue-800 bg-white p-2.5 text-slate-950 shadow-sm sm:p-6"
        >
          <ReportWatermark company={company} />

          <div className="relative z-10 grid min-w-0 grid-cols-1 gap-4 border-b-2 border-blue-800 pb-5 sm:grid-cols-[110px_minmax(0,1fr)_180px] sm:items-start">
            <div className="flex justify-center sm:justify-start">
              {company.logo_url ? (
                <img src={company.logo_url} alt="Company logo" className="size-20 rounded-2xl border border-blue-100 bg-white object-contain p-2 sm:size-24" />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 text-center text-xs font-black text-blue-700 sm:size-24">د لوګو ځای</div>
              )}
            </div>

            <div className="min-w-0 text-center">
              <h2 className="break-words text-2xl font-black text-blue-900 sm:text-4xl">{company.company_name || "AZI SYSTEM"}</h2>
              <p className="mt-1 break-words font-bold text-slate-600">{company.report_title || "د مشتري رسمي حسابي راپور"}</p>
              <div className="mt-3 space-y-1 text-xs font-semibold text-slate-500 sm:text-sm">
                <p className="break-words">پته: {company.address || "—"}</p>
                <p className="break-words">تماس: {company.phone || "—"}{company.email ? ` | ${company.email}` : ""}</p>
              </div>
            </div>

            <div className="min-w-0 rounded-xl bg-blue-50 p-3 text-center text-xs font-bold text-slate-600 sm:text-right sm:text-sm">
              <p className="break-all">سند نمبر: {documentNumber}</p>
              <p className="mt-2">چاپ: {formatShamsi(new Date())}</p>
            </div>
          </div>

          <div className="relative z-10 mt-3 grid min-w-0 gap-2 rounded-xl border border-slate-300 bg-white/90 p-2 sm:grid-cols-[1fr_2fr]">
            <ReportValue label="د قرضدار نوم" value={customer.name} />
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-bold">
              <p className="break-words"><span className="text-slate-500">موبایل:</span> {customer.phone || "—"}</p>
              <p className="break-words"><span className="text-slate-500">ادرس:</span> {customer.address || "—"}</p>
            </div>
          </div>

          <div className="relative z-10 mt-3 grid min-w-0 grid-cols-3 gap-2">
            <ReportValue label="جمله حساب" value={formatCurrency(totals.totalDebt, currency)} words={amountWordsWithCurrency(numberToPashto(totals.totalDebt), currency)} strong="red" />
            <ReportValue label="ټول وصولي" value={formatCurrency(totals.totalPaid, currency)} words={amountWordsWithCurrency(numberToPashto(totals.totalPaid), currency)} strong="green" />
            <ReportValue label="موجوده قرض" value={formatCurrency(totals.balance, currency)} words={amountWordsWithCurrency(numberToPashto(totals.balance), currency)} strong="blue" />
          </div>

          <div className="relative z-10">
            <PrintHistoryTable
              title="د وصولي تاریخچه"
              headers={["تاریخ", "مبلغ", "طریقه", "حواله نمبر", "ادرس"]}
              rows={payments.map((row) => [
                displayHistoryDate(paymentHistoryShamsiDate(row)),
                <AmountPrintCell key={`pay-${row.id}`} amount={row.amount} words={row.amount_words} currency={currency} />,
                paymentMethodLabel(row.method),
                row.method === "hawala" || row.method === "bank" ? row.hawala_number || "—" : "—",
                row.method === "hawala" || row.method === "bank" ? row.shop_address || "—" : "—",
              ])}
            />

            <PrintHistoryTable
              title="باقیات"
              headers={["بل نمبر", "تاریخ", "مبلغ"]}
              rows={balances.map((row) => [
                row.bill_number || "—",
                displayHistoryDate(balanceHistoryShamsiDate(row)),
                <AmountPrintCell key={`bal-${row.id}`} amount={row.amount ?? row.total_amount} words={row.amount_words} currency={currency} />,
              ])}
            />
          </div>

          <div className="relative z-10 mt-12 grid grid-cols-3 gap-5 text-center text-xs font-black sm:gap-10 sm:text-sm">
            <div className="border-t border-slate-700 pt-3">{company.debtor_signature_label || "د قرضدار امضا"}</div>
            <div className="border-t border-slate-700 pt-3">{company.accountant_signature_label || "د محاسب امضا"}</div>
            <div className="border-t border-slate-700 pt-3">{company.stamp_label || "مهر او تایید"}</div>
          </div>

          <p className="relative z-10 mt-10 break-words border-t border-slate-200 pt-4 text-center text-xs font-bold text-slate-500">{company.footer_text || ""}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button type="button" className="w-full" onClick={onPrint}><FiPrinter /> راپور چاپ کړئ</Button>
        <Button type="button" variant="success" className="w-full" onClick={onSharePdf} disabled={sharingPdf}>
          <FaWhatsapp /> {sharingPdf ? "PDF جوړېږي..." : "PDF واتساپ ته"}
        </Button>
      </div>
    </div>
  );
}

function ReportWatermark({ company }) {
  const source = company.watermark_logo_url || company.logo_url;
  if (company.watermark_enabled === false || !source) return null;
  const opacity = Math.min(0.12, Math.max(0.02, Number(company.watermark_opacity || 0.05)));
  return (
    <img
      src={source}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute bottom-8 left-1/2 w-[36%] -translate-x-1/2 object-contain"
      style={{ opacity }}
    />
  );
}

function AmountPrintCell({ amount, words, currency }) {
  return (
    <div className="min-w-0">
      <p className="font-black">{formatCurrency(amount, currency)}</p>

    </div>
  );
}

function PrintHistoryTable({ title, headers, rows }) {
  return (
    <div className="mt-3 min-w-0">
      <h3 className="mb-1.5 text-base font-black text-blue-900">{title}</h3>
      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-300">
        <table className="w-full table-fixed text-[10px] sm:text-xs">
          <thead className="bg-blue-50">
            <tr>{headers.map((header) => <th key={header} className="break-words border border-slate-300 px-1.5 py-1 text-right font-black">{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="break-words border border-slate-300 px-1.5 py-1 align-top font-semibold">{cell}</td>)}</tr>
            )) : <tr><td colSpan={headers.length} className="border border-slate-300 p-4 text-center">ریکارډ نشته</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportValue({ label, value, words, strong }) {
  const colors = { red: "text-red-600", green: "text-emerald-700", blue: "text-blue-700" };
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={`mt-1 break-words font-black ${colors[strong] || "text-slate-950"}`}>{value}</p>

    </div>
  );
}

function PaymentReceipt({ receipt, onClose }) {
  return (
    <div dir="rtl" className="space-y-4">
      <div id="payment-receipt-print" className="border-4 border-double border-emerald-700 bg-white p-5">
        <div className="rounded-2xl bg-gradient-to-l from-emerald-700 to-teal-500 p-5 text-white">
          <p className="text-sm font-bold text-emerald-100">د وصولي رسید</p>
          <h3 className="mt-1 text-2xl font-black">{receipt.customer.name}</h3>
          <p className="mt-2 text-sm">{receipt.customer.phone || "—"}</p>
        </div>
        <div className="mt-4 space-y-2">
          <ReceiptLine label="مقدار" value={formatCurrency(receipt.amount, receipt.customer.currency)} />
          <ReceiptLine label="په پښتو" value={amountWordsWithCurrency(receipt.amount_words, receipt.customer.currency)} />
          <ReceiptLine label="طریقه" value={paymentMethodLabel(receipt.method)} />
          <ReceiptLine label="تاریخ" value={receipt.date || "—"} />
          {receipt.method === "hawala" ? (
            <>
              <ReceiptLine label="حواله نمبر" value={receipt.hawala_number || "—"} />
              <ReceiptLine label="ادرس" value={receipt.shop_address || "—"} />
            </>
          ) : null}
          <ReceiptLine label="باقي قرض" value={formatCurrency(receipt.remaining_balance, receipt.customer.currency)} />
        </div>
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-sm font-black">
          <div className="border-t border-slate-700 pt-2">امضا</div>
          <div className="border-t border-slate-700 pt-2">مهر</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button className="w-full" onClick={() => printElement("payment-receipt-print", "د وصولي رسید")}>
          <FiPrinter /> رسید چاپ کړئ
        </Button>
        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function WhatsAppConfirmation({ customerName, phone, mode = "account-image", sending, onCancel, onConfirm }) {
  const isPdf = mode === "pdf";
  const isReceipt = mode === "receipt-image";
  const heading = isPdf
    ? "ایا PDF راپور شریک شي؟"
    : isReceipt
      ? "ایا د وصولي رسید واستول شي؟"
      : "ایا حسابي کارت واستول شي؟";
  const description = isPdf
    ? "رسمي حسابي PDF به د Share له لارې واتساپ ته تیار شي."
    : isReceipt
      ? "ښکلی تصویري رسید به د Share له لارې واتساپ ته تیار شي."
      : "ښکلی حسابي کارت به د Share له لارې واتساپ ته تیار شي.";

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-[26px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-green-50 p-5 text-center shadow-inner">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-600 text-3xl text-white shadow-lg">
          <FaWhatsapp />
        </span>
        <h3 className="mt-4 text-xl font-black text-slate-950">{heading}</h3>
        <p className="mt-2 text-sm font-bold leading-7 text-slate-600">
          د <span className="text-emerald-700">{customerName}</span> لپاره {description}
        </p>
        <p dir="ltr" className="mt-2 text-lg font-black text-slate-950">+{phone}</p>
        <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs font-bold leading-6 text-slate-500">
          په موبایل کې Share Sheet خلاصیږي. په لپټاپ کې فایل ډاونلوډ او د هماغه واتساپ Chat پرانیستل کېږي.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>نه</Button>
        <Button type="button" variant="success" onClick={onConfirm} disabled={sending}>
          <FaWhatsapp /> {sending ? "جوړېږي..." : "OK — شریک یې کړه"}
        </Button>
      </div>
    </div>
  );
}

function PageWatermark({ company }) {
  const enabled = company.watermark_enabled !== false;
  const source = company.watermark_logo_url || company.logo_url;
  if (!enabled || !source) return null;

  const opacity = Math.min(0.18, Math.max(0.02, Number(company.watermark_opacity || 0.06)));

  return (
    <div aria-hidden="true" className="pointer-events-none flex justify-center py-4 sm:py-6">
      <img
        src={source}
        alt=""
        className="h-16 max-w-[180px] object-contain grayscale sm:h-20 sm:max-w-[220px]"
        style={{ opacity }}
      />
    </div>
  );
}


function ReceiptLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className="text-sm font-black text-slate-950">{value}</span>
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

function formatCurrency(amount, currency = "AFN") {
  const value = Number(amount || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return currency === "USD" ? `$${value}` : `${value} ؋`;
}

function paymentMethodLabel(method) {
  if (method === "hawala" || method === "bank") return "حواله";
  return "نقده";
}

function balanceTypeLabel(type) {
  if (type === "goods_credit") return "درک مال";
  return "نقل بل";
}

function invoiceToBalance(invoice) {
  return {
    ...invoice,
    id: invoice.id,
    type: "bill_transfer",
    bill_number: invoice.invoice_number,
    date: invoice.invoice_date,
    amount: Number(invoice.total_amount || invoice.remaining_amount || 0),
  };
}

function shamsiDateSortKey(value) {
  if (!value) return 0;
  const normalized = toEnglishDigits(value)
    .trim()
    .replace(/[-.]/g, "/")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return 0;
  return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
}

function paymentHistoryShamsiDate(row) {
  if (row?.payment_date_shamsi) return row.payment_date_shamsi;
  if (row?.payment_date) return formatShamsi(row.payment_date);
  return "";
}

function balanceHistoryShamsiDate(row) {
  if (row?.date_shamsi) return row.date_shamsi;
  const gregorianDate = row?.record_date || row?.date || row?.invoice_date;
  if (gregorianDate) return formatShamsi(gregorianDate);
  return "";
}

function compareDebtorHistoryDates(dateB, dateA, createdB, createdA) {
  const primary = shamsiDateSortKey(dateB) - shamsiDateSortKey(dateA);
  if (primary !== 0) return primary;

  // Same transaction date: most recently created record appears first.
  const timeB = createdB ? new Date(createdB).getTime() : 0;
  const timeA = createdA ? new Date(createdA).getTime() : 0;
  return timeB - timeA;
}

function displayHistoryDate(value) {
  if (!value) return "—";
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(String(value))) return value;
  return formatDate(value);
}

function normalizeShamsiInput(value) {
  const clean = toEnglishDigits(value).replace(/[^0-9/]/g, "").slice(0, 10);
  return clean;
}

function formatShamsi(value = new Date()) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    const formatted = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    return toEnglishDigits(formatted.replace(/\u200e/g, "").replace(/-/g, "/"));
  } catch {
    return "—";
  }
}

function toEnglishDigits(value) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return String(value)
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
}

function numberToPashto(input) {
  const number = Math.floor(Number(input || 0));
  if (!number) return "";
  if (number < 0) return `منفي ${numberToPashto(Math.abs(number))}`;

  const scales = [
    [1_000_000_000, "میلیارد"],
    [1_000_000, "میلیون"],
    [1_000, "زره"],
  ];
  let remainder = number;
  const parts = [];
  for (const [size, label] of scales) {
    if (remainder >= size) {
      const count = Math.floor(remainder / size);
      parts.push(`${underThousandPashto(count)} ${label}`);
      remainder %= size;
    }
  }
  if (remainder) parts.push(underThousandPashto(remainder));
  return parts.join(" او ");
}

function underThousandPashto(number) {
  const units = ["", "یو", "دوه", "درې", "څلور", "پنځه", "شپږ", "اووه", "اته", "نهه", "لس", "یوولس", "دولس", "دیارلس", "څوارلس", "پنځلس", "شپاړس", "اوولس", "اتلس", "نولس"];
  const tens = { 20: "شل", 30: "دېرش", 40: "څلوېښت", 50: "پنځوس", 60: "شپېته", 70: "اویا", 80: "اتیا", 90: "نوي" };
  const hundreds = { 1: "سل", 2: "دوه سوه", 3: "درې سوه", 4: "څلور سوه", 5: "پنځه سوه", 6: "شپږ سوه", 7: "اووه سوه", 8: "اته سوه", 9: "نهه سوه" };
  const parts = [];
  let rest = number;
  if (rest >= 100) {
    const h = Math.floor(rest / 100);
    parts.push(hundreds[h]);
    rest %= 100;
  }
  if (rest) {
    if (rest < 20) {
      parts.push(units[rest]);
    } else {
      const ten = Math.floor(rest / 10) * 10;
      const one = rest % 10;
      parts.push(one ? `${units[one]} ${tens[ten]}` : tens[ten]);
    }
  }
  return parts.join(" او ");
}

function loadMarketSuggestions() {
  try {
    const saved = JSON.parse(localStorage.getItem(MARKET_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveMarketSuggestion(market, current) {
  const clean = String(market || "").trim();
  const next = Array.from(new Set([clean, ...current].filter(Boolean))).slice(0, 50);
  localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function amountWordsWithCurrency(words, currency) {
  const clean = String(words || "").trim();
  if (!clean) return "—";
  return currency === "USD" ? `${clean} ډالر` : `${clean} افغانۍ`;
}

function buildReceiptWhatsAppMessage({ company, receipt }) {
  return `محترم ${receipt.customer.name}، ستاسو وصولي ثبت شوه. د وصولۍ رسید مو درولېږه، مهرباني وکړئ ویې ګورئ. مننه — ${company.company_name || "WMS Pro"}`;
}

function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

function buildWhatsAppMessage({ company, customer, totals, currency }) {
  return [
    company.whatsapp_greeting || "السلام علیکم",
    `ګرانه ${customer.name}`,
    `ستاسې جمله حساب ${formatCurrency(totals.totalDebt, currency)} دی (${amountWordsWithCurrency(numberToPashto(totals.totalDebt), currency)}).`,
    `وصول شوی مقدار مو ${formatCurrency(totals.totalPaid, currency)} دی (${amountWordsWithCurrency(numberToPashto(totals.totalPaid), currency)}).`,
    `اوس پر تاسو ${formatCurrency(totals.balance, currency)} باقی دی (${amountWordsWithCurrency(numberToPashto(totals.balance), currency)}).`,
    company.whatsapp_request || "مهرباني وکړئ د فرصت په صورت کې خپل حساب تصفیه کړئ",
    company.whatsapp_closing || "مننه",
    company.company_name ? `— ${company.company_name}` : "",
    company.phone ? `تماس: ${company.phone}` : "",
  ].filter(Boolean).join("\n");
}

async function createReceiptCardBlob({ company, receipt }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("د رسید عکس جوړ نه شو.");

  const currency = receipt.customer.currency || "AFN";
  const totalBeforePayment = Number(receipt.amount || 0) + Number(receipt.remaining_balance || 0);

  const background = ctx.createLinearGradient(0, 0, 1080, 1500);
  background.addColorStop(0, "#eefbf2");
  background.addColorStop(0.5, "#ffffff");
  background.addColorStop(1, "#e0f2fe");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1080, 1500);

  drawRoundedRect(ctx, 55, 55, 970, 1390, 48, "#ffffff", "#bbf7d0");
  const headerGradient = ctx.createLinearGradient(80, 80, 1000, 300);
  headerGradient.addColorStop(0, "#0f4ed8");
  headerGradient.addColorStop(1, "#06b6d4");
  drawRoundedRect(ctx, 80, 80, 920, 250, 34, headerGradient);

  drawLogoPlaceholder(ctx, 900, 170);

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 46px Arial, Tahoma, sans-serif";
  ctx.fillText(company.company_name || "AZI SYSTEM", 790, 150);
  ctx.font = "700 25px Arial, Tahoma, sans-serif";
  ctx.fillStyle = "#dbeafe";
  ctx.fillText(company.address || "", 790, 198);
  ctx.fillText(company.phone ? `تماس: ${company.phone}` : "", 790, 238);

  drawRoundedRect(ctx, 260, 280, 560, 105, 26, "#0f4ed8");
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 48px Arial, Tahoma, sans-serif";
  ctx.fillText("رسید وصولي", 540, 350);

  ctx.textAlign = "right";
  ctx.fillStyle = "#0f766e";
  ctx.font = "900 38px Arial, Tahoma, sans-serif";
  ctx.fillText(company.whatsapp_greeting || "السلام علیکم", 930, 445);
  ctx.fillStyle = "#0f172a";
  ctx.font = "900 42px Arial, Tahoma, sans-serif";
  ctx.fillText(`ګرانه ${receipt.customer.name}`, 930, 510);

  const rows = [
    ["وصول شوی مقدار", formatCurrency(receipt.amount, currency), amountWordsWithCurrency(receipt.amount_words || numberToPashto(receipt.amount), currency), "#059669"],
  ];

  let y = 565;
  for (const [label, value, words, color] of rows) {
    drawRoundedRect(ctx, 110, y, 860, 165, 28, "#f8fafc", "#dbeafe");
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = "800 27px Arial, Tahoma, sans-serif";
    ctx.fillText(label, 915, y + 45);
    ctx.fillStyle = color;
    ctx.font = "900 46px Arial, Tahoma, sans-serif";
    ctx.fillText(value, 915, y + 98);
    ctx.fillStyle = "#475569";
    ctx.font = "700 22px Arial, Tahoma, sans-serif";
    wrapCanvasRtlText(ctx, words, 915, y + 135, 720, 28, 2);
    y += 182;
  }

  drawRoundedRect(ctx, 110, 1120, 410, 135, 24, "#f0fdf4", "#bbf7d0");
  drawRoundedRect(ctx, 560, 1120, 410, 135, 24, "#eff6ff", "#bfdbfe");
  ctx.fillStyle = "#64748b";
  ctx.font = "800 24px Arial, Tahoma, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("طریقه", 930, 1165);
  ctx.fillText("نېټه", 480, 1165);
  ctx.fillStyle = "#0f172a";
  ctx.font = "900 32px Arial, Tahoma, sans-serif";
  ctx.fillText(paymentMethodLabel(receipt.method), 930, 1215);
  ctx.fillText(receipt.date || "—", 480, 1215);

  if (receipt.method === "hawala") {
    drawRoundedRect(ctx, 110, 1275, 860, 100, 22, "#faf5ff", "#e9d5ff");
    ctx.fillStyle = "#6d28d9";
    ctx.font = "800 24px Arial, Tahoma, sans-serif";
    ctx.fillText(`حواله نمبر: ${receipt.hawala_number || "—"}`, 930, 1318);
    ctx.fillStyle = "#334155";
    ctx.font = "700 22px Arial, Tahoma, sans-serif";
    wrapCanvasRtlText(ctx, `ادرس: ${receipt.shop_address || "—"}`, 930, 1355, 760, 28, 2);
  }

  ctx.fillStyle = "#0f766e";
  ctx.font = "900 28px Arial, Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(company.whatsapp_closing || "مننه", 540, 1410);

  try {
    const dataUrl = canvas.toDataURL("image/png");
    const response = await fetch(dataUrl);
    return await response.blob();
  } catch (error) {
    throw new Error("د رسید عکس جوړ نه شو. مهرباني وکړئ بیا هڅه وکړئ.");
  }
}

async function createWhatsAppCardBlob({ company, customer, totals, currency }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas جوړ نه شو.");

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, "#0b3abf");
  gradient.addColorStop(0.55, "#0866e8");
  gradient.addColorStop(1, "#09b9d5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);

  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for (let i = 0; i < 30; i += 1) {
    ctx.beginPath();
    ctx.arc((i * 149) % 1080, (i * 97) % 1350, 4 + (i % 4) * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawRoundedRect(ctx, 55, 55, 970, 1240, 46, "#ffffff");
  drawRoundedRect(ctx, 80, 80, 920, 230, 34, "#0f4ed8");

  if (company.logo_url) {
    try {
      const logo = await loadCanvasImage(company.logo_url);
      drawRoundedRect(ctx, 835, 110, 130, 130, 28, "#ffffff");
      ctx.drawImage(logo, 850, 125, 100, 100);
    } catch {
      drawLogoPlaceholder(ctx, 900, 175);
    }
  } else {
    drawLogoPlaceholder(ctx, 900, 175);
  }

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 48px Arial, Tahoma, sans-serif";
  ctx.fillText(company.company_name || "AZI SYSTEM ", 790, 155);
  ctx.font = "700 27px Arial, Tahoma, sans-serif";
  ctx.fillStyle = "#dbeafe";
  ctx.fillText(company.address || "", 790, 205);
  ctx.fillText(company.phone ? `تماس: ${company.phone}` : "", 790, 245);

  ctx.fillStyle = "#0f172a";
  ctx.font = "900 46px Arial, Tahoma, sans-serif";
  ctx.fillText(company.whatsapp_greeting || "السلام علیکم", 950, 375);
  ctx.font = "900 44px Arial, Tahoma, sans-serif";
  ctx.fillStyle = "#1746b7";
  ctx.fillText(`ګرانه ${customer.name}`, 950, 440);

  const info = [
    ["ستاسې جمله حساب", formatCurrency(totals.totalDebt, currency), amountWordsWithCurrency(numberToPashto(totals.totalDebt), currency), "#dc2626"],
    ["وصول شوی مقدار", formatCurrency(totals.totalPaid, currency), amountWordsWithCurrency(numberToPashto(totals.totalPaid), currency), "#059669"],
    ["اوس باقی حساب", formatCurrency(totals.balance, currency), amountWordsWithCurrency(numberToPashto(totals.balance), currency), "#1d4ed8"],
  ];

  let y = 505;
  for (const [label, value, words, color] of info) {
    drawRoundedRect(ctx, 105, y, 870, 180, 28, "#f8fafc", "#dbeafe");
    ctx.fillStyle = "#64748b";
    ctx.font = "800 28px Arial, Tahoma, sans-serif";
    ctx.fillText(label, 920, y + 48);
    ctx.fillStyle = color;
    ctx.font = "900 48px Arial, Tahoma, sans-serif";
    ctx.fillText(value, 920, y + 105);
    ctx.fillStyle = "#475569";
    ctx.font = "700 24px Arial, Tahoma, sans-serif";
    wrapCanvasRtlText(ctx, words, 920, y + 145, 760, 32, 2);
    y += 200;
  }

  ctx.fillStyle = "#334155";
  ctx.font = "700 30px Arial, Tahoma, sans-serif";
  wrapCanvasRtlText(
    ctx,
    company.whatsapp_request || "مهرباني وکړئ د فرصت په صورت کې خپل حساب تصفیه کړئ",
    930,
    1135,
    820,
    42,
    3,
  );

  ctx.fillStyle = "#1746b7";
  ctx.font = "900 32px Arial, Tahoma, sans-serif";
  ctx.fillText(company.whatsapp_closing || "مننه", 930, 1245);
  ctx.fillStyle = "#64748b";
  ctx.font = "700 22px Arial, Tahoma, sans-serif";
  ctx.fillText(`تاریخ: ${formatShamsi(new Date())}`, 300, 1245);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("عکس جوړ نه شو."))), "image/png", 0.95);
  });
}

async function createReportPdfBlob({ company, customer, totals, payments, balances, currency }) {
  const canvas = await createReportCanvas({
    company,
    customer,
    totals,
    payments,
    balances,
    currency,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageScale = pageWidth / canvas.width;
  const sourcePageHeight = Math.floor(pageHeight / imageScale);

  let sourceY = 0;
  let pageIndex = 0;
  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const sliceContext = slice.getContext("2d");
    if (!sliceContext) throw new Error("PDF canvas جوړ نه شو.");
    sliceContext.fillStyle = "#ffffff";
    sliceContext.fillRect(0, 0, slice.width, slice.height);
    sliceContext.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    );

    if (pageIndex > 0) pdf.addPage();
    const renderedHeight = sliceHeight * imageScale;
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, renderedHeight);
    sourceY += sliceHeight;
    pageIndex += 1;
  }

  return pdf.output("blob");
}

async function createReportCanvas({ company, customer, totals, payments, balances, currency }) {
  const width = 1240;
  const paymentHeight = Math.max(1, payments.length) * 112;
  const balanceHeight = Math.max(1, balances.length) * 104;
  const height = Math.max(1754, 1110 + paymentHeight + balanceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("راپور canvas جوړ نه شو.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth = 5;
  ctx.strokeRect(32, 32, width - 64, height - 64);
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, width - 88, height - 88);

  const watermarkSource = company.watermark_logo_url || company.logo_url;
  if (company.watermark_enabled !== false && watermarkSource) {
    try {
      const watermark = await loadCanvasImage(watermarkSource);
      ctx.save();
      ctx.globalAlpha = Math.min(0.1, Math.max(0.025, Number(company.watermark_opacity || 0.05)));
      const watermarkWidth = 440;
      const watermarkHeight = (watermark.height / watermark.width) * watermarkWidth;
      ctx.drawImage(watermark, (width - watermarkWidth) / 2, height - watermarkHeight - 150, watermarkWidth, watermarkHeight);
      ctx.restore();
    } catch {
      // The report remains valid when a remote logo cannot be drawn on canvas.
    }
  }

  ctx.direction = "rtl";
  ctx.textAlign = "right";

  if (company.logo_url) {
    try {
      const logo = await loadCanvasImage(company.logo_url);
      drawRoundedRect(ctx, 80, 78, 150, 150, 28, "#f8fafc", "#bfdbfe");
      ctx.drawImage(logo, 100, 98, 110, 110);
    } catch {
      drawLogoPlaceholder(ctx, 155, 153);
    }
  } else {
    drawLogoPlaceholder(ctx, 155, 153);
  }

  ctx.fillStyle = "#153d9f";
  ctx.font = "900 54px Arial, Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(company.company_name || "AZI SYSTEM", width / 2, 130);
  ctx.font = "800 30px Arial, Tahoma, sans-serif";
  ctx.fillStyle = "#334155";
  ctx.fillText(company.report_title || "د مشتري رسمي حسابي راپور", width / 2, 178);
  ctx.font = "700 22px Arial, Tahoma, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(company.address || "—", width / 2, 218);
  ctx.fillText([company.phone, company.email].filter(Boolean).join(" | ") || "—", width / 2, 252);

  ctx.textAlign = "right";
  drawRoundedRect(ctx, 960, 82, 200, 145, 22, "#eff6ff", "#bfdbfe");
  ctx.fillStyle = "#475569";
  ctx.font = "800 20px Arial, Tahoma, sans-serif";
  ctx.fillText(`سند نمبر: ${company.document_prefix || "DB"}-${String(customer.id || "").slice(-6)}`, 1135, 132);
  ctx.fillText(`تاریخ: ${formatShamsi(new Date())}`, 1135, 180);

  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(80, 290);
  ctx.lineTo(1160, 290);
  ctx.stroke();

  let y = 330;
  drawCanvasSectionTitle(ctx, "د قرضدار معلومات", y);
  y += 54;
  const customerItems = [
    ["نوم", customer.name || "—"],
    ["موبایل", customer.phone || "—"],
    ["ادرس", customer.address || "—"],
  ];
  customerItems.forEach(([label, value], index) => {
    const cardWidth = 340;
    const x = 80 + index * 360;
    drawRoundedRect(ctx, x, y, cardWidth, 112, 22, "#f8fafc", "#dbeafe");
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = "800 20px Arial, Tahoma, sans-serif";
    ctx.fillText(label, x + cardWidth - 24, y + 38);
    ctx.fillStyle = "#0f172a";
    ctx.font = "900 27px Arial, Tahoma, sans-serif";
    wrapCanvasRtlText(ctx, value, x + cardWidth - 24, y + 80, cardWidth - 48, 32, 2);
  });
  y += 150;

  drawCanvasSectionTitle(ctx, "حساب", y);
  y += 54;
  const accountItems = [
    ["جمله حساب", totals.totalDebt, "#dc2626"],
    ["ټول وصولي", totals.totalPaid, "#059669"],
    ["موجوده قرض", totals.balance, "#1d4ed8"],
  ];
  accountItems.forEach(([label, amount, color], index) => {
    const cardWidth = 340;
    const x = 80 + index * 360;
    drawRoundedRect(ctx, x, y, cardWidth, 145, 22, "#ffffff", "#dbeafe");
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = "800 20px Arial, Tahoma, sans-serif";
    ctx.fillText(label, x + cardWidth - 24, y + 36);
    ctx.fillStyle = color;
    ctx.font = "900 34px Arial, Tahoma, sans-serif";
    ctx.fillText(formatCurrency(amount, currency), x + cardWidth - 24, y + 82);
    ctx.fillStyle = "#475569";
    ctx.font = "700 18px Arial, Tahoma, sans-serif";
    wrapCanvasRtlText(ctx, amountWordsWithCurrency(numberToPashto(amount), currency), x + cardWidth - 24, y + 116, cardWidth - 48, 24, 2);
  });
  y += 185;

  drawCanvasSectionTitle(ctx, "د وصولي تاریخچه", y);
  y += 52;
  if (!payments.length) {
    drawCanvasEmptyRow(ctx, y, "وصولي ریکارډ نشته");
    y += 90;
  } else {
    payments.forEach((row) => {
      drawRoundedRect(ctx, 80, y, 1080, 94, 18, "#f0fdf4", "#a7f3d0");
      ctx.textAlign = "right";
      drawCanvasLabelValue(ctx, 1130, y + 30, "تاریخ", displayHistoryDate(paymentHistoryShamsiDate(row)));
      drawCanvasLabelValue(ctx, 915, y + 30, "مبلغ", formatCurrency(row.amount, currency), "#047857");
      drawCanvasLabelValue(ctx, 675, y + 30, "طریقه", paymentMethodLabel(row.method));
      drawCanvasLabelValue(ctx, 455, y + 30, "حواله نمبر", row.hawala_number || "—");
      drawCanvasLabelValue(ctx, 230, y + 30, "ادرس", row.shop_address || "—");
      ctx.fillStyle = "#64748b";
      ctx.font = "700 16px Arial, Tahoma, sans-serif";
      ctx.fillText(amountWordsWithCurrency(row.amount_words || numberToPashto(row.amount), currency), 915, y + 77);
      y += 112;
    });
  }

  y += 20;
  drawCanvasSectionTitle(ctx, "باقیات", y);
  y += 52;
  if (!balances.length) {
    drawCanvasEmptyRow(ctx, y, "باقیات ریکارډ نشته");
    y += 90;
  } else {
    balances.forEach((row) => {
      const amount = row.amount ?? row.total_amount;
      drawRoundedRect(ctx, 80, y, 1080, 86, 18, "#eff6ff", "#bfdbfe");
      drawCanvasLabelValue(ctx, 1130, y + 28, "بل نمبر", row.bill_number || "—");
      drawCanvasLabelValue(ctx, 790, y + 28, "تاریخ", displayHistoryDate(balanceHistoryShamsiDate(row)));
      drawCanvasLabelValue(ctx, 440, y + 28, "مبلغ", formatCurrency(amount, currency), "#dc2626");
      ctx.fillStyle = "#64748b";
      ctx.font = "700 16px Arial, Tahoma, sans-serif";
      ctx.fillText(amountWordsWithCurrency(row.amount_words || numberToPashto(amount), currency), 440, y + 70);
      y += 104;
    });
  }

  const signatureY = Math.max(y + 90, height - 210);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  [[100, "د قرضدار امضا"], [455, "د محاسب امضا"], [810, "مهر او تایید"]].forEach(([x, fallback], index) => {
    ctx.beginPath();
    ctx.moveTo(x, signatureY);
    ctx.lineTo(x + 260, signatureY);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#334155";
    ctx.font = "800 20px Arial, Tahoma, sans-serif";
    const labels = [company.debtor_signature_label, company.accountant_signature_label, company.stamp_label];
    ctx.fillText(labels[index] || fallback, x + 130, signatureY + 35);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = "700 18px Arial, Tahoma, sans-serif";
  ctx.fillText(company.footer_text || "", width / 2, height - 78);

  return canvas;
}

function drawCanvasSectionTitle(ctx, title, y) {
  ctx.textAlign = "right";
  ctx.fillStyle = "#153d9f";
  ctx.font = "900 30px Arial, Tahoma, sans-serif";
  ctx.fillText(title, 1160, y + 30);
  ctx.strokeStyle = "#dbeafe";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, y + 44);
  ctx.lineTo(1160, y + 44);
  ctx.stroke();
}

function drawCanvasLabelValue(ctx, rightX, topY, label, value, color = "#0f172a") {
  ctx.textAlign = "right";
  ctx.fillStyle = "#64748b";
  ctx.font = "700 16px Arial, Tahoma, sans-serif";
  ctx.fillText(label, rightX, topY);
  ctx.fillStyle = color;
  ctx.font = "900 21px Arial, Tahoma, sans-serif";
  ctx.fillText(String(value || "—"), rightX, topY + 34);
}

function drawCanvasEmptyRow(ctx, y, message) {
  drawRoundedRect(ctx, 80, y, 1080, 70, 18, "#f8fafc", "#e2e8f0");
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = "800 22px Arial, Tahoma, sans-serif";
  ctx.fillText(message, 620, y + 43);
}

function safeFileName(value) {
  return String(value || "debtor")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "debtor";
}

function drawLogoPlaceholder(ctx, centerX, centerY) {
  drawRoundedRect(ctx, centerX - 65, centerY - 65, 130, 130, 28, "#ffffff");
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.fillStyle = "#1d4ed8";
  ctx.font = "900 34px Arial, sans-serif";
  ctx.fillText("LOGO", centerX, centerY + 12);
  ctx.direction = "rtl";
  ctx.textAlign = "right";
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke = "") {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function wrapCanvasRtlText(ctx, text, rightX, startY, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((item, index) => ctx.fillText(item, rightX, startY + index * lineHeight));
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function shareFileToWhatsApp({ file, blob, phone, message, title }) {
  if (
    navigator.share &&
    (!navigator.canShare || navigator.canShare({ files: [file] }))
  ) {
    await navigator.share({ title, text: message, files: [file] });
    return;
  }

  downloadBlob(blob, file.name);

  try {
    if (navigator.clipboard?.write && window.ClipboardItem && file.type === "image/png") {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("عکس Clipboard ته کاپي شو؛ په واتساپ کې Paste کړئ.");
    }
  } catch {
    // Clipboard is optional; the downloaded file remains available.
  }

  const fallbackMessage = `${message}\n\nفایل ډاونلوډ شوی؛ مهرباني وکړئ په همدې Chat کې یې Attach کړئ.`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(fallbackMessage)}`;
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) window.location.assign(url);
}

function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("93")) return digits;
  if (digits.startsWith("0")) return `93${digits.slice(1)}`;
  return digits;
}
