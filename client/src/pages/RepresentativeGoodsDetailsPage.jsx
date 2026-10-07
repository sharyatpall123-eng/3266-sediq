import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiBarChart2,
  FiBox,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiDollarSign,
  FiDownload,
  FiEye,
  FiFileText,
  FiMapPin,
  FiPackage,
  FiTrash2,
  FiTruck,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import Loading from "../components/ui/Loading";
import { getErrorMessage } from "../lib/api";
import { representativeService } from "../Services/wmsService";
import { formatDate, formatNumber } from "../utils/format";

const today = () => new Date().toISOString().slice(0, 10);
const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export default function RepresentativeGoodsDetailsPage() {
  const { id, goodsId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const cachedDelivery = representativeService.peekDelivery?.(id, goodsId);
  const [company, setCompany] = useState(() => cachedDelivery?.representative || null);
  const [goods, setGoods] = useState(() => cachedDelivery?.delivery || null);
  const [loading, setLoading] = useState(() => !cachedDelivery);
  const [uploading, setUploading] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ quantity: "", date: today() });
  const [savingDelivery, setSavingDelivery] = useState(false);

  const load = useCallback(async () => {
    if (!representativeService.peekDelivery?.(id, goodsId)) setLoading(true);
    try {
      const response = await representativeService.getDelivery(id, goodsId);
      setCompany(response?.representative || null);
      setGoods(response?.delivery || null);
    } catch (error) {
      toast.error(getErrorMessage(error, "د مال معلومات ترلاسه نه شول."));
    } finally {
      setLoading(false);
    }
  }, [id, goodsId]);

  useEffect(() => {
    load();
  }, [load]);

  const calculated = useMemo(() => {
    if (!goods) return null;
    const quantity = Math.max(0, Number(goods.quantity || 0));
    const delivered = Math.min(
      quantity,
      Math.max(0, Number(goods.delivered_quantity ?? goods.delivered ?? 0)),
    );
    const remaining = Math.max(0, quantity - delivered);
    const weightKg = Math.max(0, Number(goods.weight_kg ?? goods.weight ?? 0));
    const tons = weightKg / 1000;
    const cbm = Math.max(0, Number(goods.cbm || 0));
    const rentType = goods.rent_type === "ton" ? "ton" : "cbm";
    const rate = Math.max(0, Number(goods.rent_rate || 0));
    const base = rentType === "ton" ? tons : cbm;
    const totalRent = Math.max(
      0,
      Number(goods.rent_amount ?? goods.freight ?? 0) || roundMoney(base * rate),
    );
    const status = remaining <= 0 ? "تسلیم شوی" : delivered > 0 ? "نیمه تسلیم" : "لاره کې";
    return { quantity, delivered, remaining, tons, cbm, rentType, rate, totalRent, status };
  }, [goods]);

  const submitPartialDelivery = async (event) => {
    event.preventDefault();
    const quantity = Number(deliveryForm.quantity || 0);
    if (!calculated || quantity <= 0) return toast.error("د تسلیم مقدار ولیکئ.");
    if (quantity > calculated.remaining) return toast.error("تسلیم مقدار له باقي څخه زیات نه شي کېدای.");
    if (!deliveryForm.date) return toast.error("د تسلیم تاریخ ضروري دی.");

    setSavingDelivery(true);
    try {
      await representativeService.deliverPartial(id, goods.id, {
        quantity,
        date: deliveryForm.date,
      });
      toast.success(`${formatNumber(quantity)} کارتن تسلیم ثبت شول.`);
      setDeliveryModal(false);
      setDeliveryForm({ quantity: "", date: today() });
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingDelivery(false);
    }
  };

  const removeGoods = async () => {
    if (!goods || !window.confirm("آیا دا مال حذف شي؟")) return;
    try {
      await representativeService.removeDelivery(id, goods.id);
      toast.success("مال حذف شو.");
      navigate(`/representatives/${id}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const uploadBill = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !goods) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) return toast.error("یوازې PDF، JPG، PNG یا WEBP فایل انتخاب کړئ.");
    if (file.size > 2 * 1024 * 1024) return toast.error("فایل باید له 2MB څخه کوچنی وي.");

    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      await representativeService.updateDelivery(id, goods.id, {
        bill_name: file.name,
        bill_type: file.type,
        bill_data_url: dataUrl,
        bill_uploaded_at: new Date().toISOString(),
      });
      toast.success("بل اضافه شو.");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const removeBill = async () => {
    if (!goods?.bill_data_url || !window.confirm("ضمیمه شوی بل حذف شي؟")) return;
    try {
      await representativeService.updateDelivery(id, goods.id, {
        bill_name: "",
        bill_type: "",
        bill_data_url: "",
        bill_uploaded_at: "",
      });
      toast.success("بل حذف شو.");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  if (loading) return <div className="page-enter p-6"><Loading /></div>;

  if (!company || !goods || !calculated) {
    return (
      <div className="page-enter space-y-4">
        <button type="button" onClick={() => navigate(`/representatives/${id}`)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700 shadow-sm"><FiArrowLeft /> بېرته لیست ته</button>
        <div className="rounded-3xl border border-slate-200 bg-white p-8"><EmptyState title="مال پیدا نه شو" /></div>
      </div>
    );
  }

  const companyAccount = Number(company.remaining_account ?? company.account_balance ?? 0);
  const fullAddress = `${goods.location ? `${goods.location} — ` : ""}${goods.shop_address || "—"}`;

  return (
    <div className="page-enter min-w-0 space-y-4 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => navigate(`/representatives/${id}`)} className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><FiArrowLeft /> بېرته مالونو لیست ته</button>
        <div dir="ltr" className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-950 to-blue-700 px-5 py-2.5 text-white shadow-lg sm:min-w-72">
          <p className="text-lg font-black">{company.name}</p>
          <p className="mt-0.5 text-xs font-bold text-blue-100">{company.phone || "—"}</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.10)]">
        <div className="border-b border-slate-100 bg-gradient-to-l from-blue-50 via-white to-cyan-50 px-3 py-3 sm:px-5">
          <div dir="rtl" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.9fr)] lg:items-center">
            <div className="flex min-w-0 items-center gap-3 text-right">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-blue-700 to-violet-600 text-2xl text-white shadow-lg"><FiBox /></span>
              <div className="min-w-0"><p className="text-xs font-black text-blue-600">د مال جزئیات</p><h1 className="mt-1 break-words text-2xl font-black text-slate-950 sm:text-3xl">{goods.description || "—"}</h1><p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-500">{goods.details || "د جنس اضافي تفصیل نه دی ثبت شوی."}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <TopInfo icon={FiPackage} label="تعداد" value={formatNumber(calculated.quantity)} tone="violet" />
              <TopInfo icon={FiCalendar} label="د ثبت تاریخ" value={formatDate(goods.delivery_date || goods.date)} tone="blue" />
              <TopInfo icon={FiMapPin} label="دکان ادرس" value={fullAddress} tone="cyan" />
              <TopInfo icon={FiCheckCircle} label="د مال حالت" value={calculated.status} tone={calculated.remaining > 0 ? "orange" : "green"} />
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 p-3 sm:p-4 xl:grid-cols-2">
          <InfoPanel title="وزن او اندازه" icon={FiBarChart2} tone="blue">
            <InfoRow label="وزن په ټن" value={`${formatNumber(roundMoney(calculated.tons))} ټن`} />
            <InfoRow label="CBM" value={`${formatNumber(calculated.cbm)} CBM`} />
          </InfoPanel>

          <InfoPanel title="د نرخ او کرایې معلومات" icon={FiTruck} tone="violet">
            <InfoRow label="د نرخ ډول" value={calculated.rentType === "ton" ? "فی ټن" : "فی CBM"} badgeTone={calculated.rentType === "ton" ? "orange" : "violet"} />
            <InfoRow label={calculated.rentType === "ton" ? "فی ټن نرخ" : "فی CBM نرخ"} value={`${formatNumber(calculated.rate)} ؋`} />
            <InfoRow label="ټوله کرایه" value={`${formatNumber(calculated.totalRent)} ؋`} strong />
          </InfoPanel>

          <InfoPanel title="قیمت او شرکت حساب" icon={FiDollarSign} tone="green">
            <InfoRow label="د جنس قیمت" value={`${formatNumber(goods.price || goods.goods_price || 0)} ؋`} strong />
            <InfoRow label="د شرکت باقي حساب" value={`${formatNumber(companyAccount)} ؋`} />
          </InfoPanel>

          <InfoPanel title="تسلیم او باقي" icon={FiCheckCircle} tone="orange">
            <InfoRow label="تسلیم شوی مقدار" value={formatNumber(calculated.delivered)} valueTone="green" />
            <InfoRow label="باقي مقدار (لاره کې)" value={formatNumber(calculated.remaining)} valueTone="orange" />
            <InfoRow label="د مال حالت" value={calculated.status} />
          </InfoPanel>
        </div>

        <div className="mx-3 mb-4 overflow-hidden rounded-[18px] border border-rose-200 bg-gradient-to-l from-rose-50 via-white to-orange-50 sm:mx-5">
          <div dir="rtl" className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-right"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-xl text-rose-600"><FiFileText /></span><div><h3 className="font-black text-rose-700">د بل فایل</h3><p className="text-[11px] font-bold text-slate-500">PDF یا عکس تر 2MB پورې</p></div></div>
            {goods.bill_data_url ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => window.open(goods.bill_data_url, "_blank", "noopener,noreferrer")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs font-black text-blue-700"><FiEye /> وګوره</button>
                <a href={goods.bill_data_url} download={goods.bill_name || "bill"} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700"><FiDownload /> ډاونلوډ</a>
                <button type="button" onClick={removeBill} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-black text-red-600"><FiTrash2 /> حذف</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 text-xs font-black text-rose-600"><FiUploadCloud /> {uploading ? "اپلوډېږي..." : "بل اپلوډ کړه"}</button>
            )}
            <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={uploadBill} />
          </div>
        </div>

        <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2 sm:p-5">
          <button type="button" onClick={removeGoods} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 font-black text-red-600 hover:bg-red-100"><FiTrash2 /> مال حذف کړه</button>
          <button type="button" onClick={() => setDeliveryModal(true)} disabled={calculated.remaining <= 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 font-black text-white shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"><FiCheck /> {calculated.remaining <= 0 ? "مال تسلیم شوی" : "تسلیم ثبت کړه"}</button>
        </div>
      </section>

      {deliveryModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeliveryModal(false); }}>
          <form onSubmit={submitPartialDelivery} dir="rtl" className="w-full max-w-md overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between bg-gradient-to-l from-emerald-700 to-teal-500 px-5 py-4 text-white">
              <div className="text-right"><h2 className="text-xl font-black">تسلیم ثبت کړه</h2><p className="mt-1 text-xs font-bold text-emerald-50">یوازې اوسنی تسلیم شوی مقدار ثبتېږي.</p></div>
              <button type="button" onClick={() => setDeliveryModal(false)} className="flex size-9 items-center justify-center rounded-xl bg-white/15 text-xl"><FiX /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="ټول" value={calculated.quantity} tone="blue" />
                <MiniStat label="مخکې تسلیم" value={calculated.delivered} tone="green" />
                <MiniStat label="باقي" value={calculated.remaining} tone="orange" />
              </div>
              <Field label="اوس تسلیم شوی مقدار *"><input autoFocus required type="number" min="0.01" max={calculated.remaining} step="0.01" className="field h-11" value={deliveryForm.quantity} onChange={(event) => setDeliveryForm({ ...deliveryForm, quantity: event.target.value })} /></Field>
              <Field label="د تسلیم تاریخ *"><input required type="date" className="field h-11" value={deliveryForm.date} onChange={(event) => setDeliveryForm({ ...deliveryForm, date: event.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="secondary" onClick={() => setDeliveryModal(false)}>لغوه</Button><Button type="submit" disabled={savingDelivery}>{savingDelivery ? "ثبتېږي..." : "تسلیم تایید کړه"}</Button></div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function TopInfo({ icon: Icon, label, value, tone }) {
  const tones = { violet: "border-violet-100 bg-violet-50 text-violet-700", blue: "border-blue-100 bg-blue-50 text-blue-700", cyan: "border-cyan-100 bg-cyan-50 text-cyan-700", green: "border-emerald-100 bg-emerald-50 text-emerald-700", orange: "border-orange-100 bg-orange-50 text-orange-700" };
  return <div className={`min-w-0 rounded-xl border p-2.5 text-right ${tones[tone] || tones.blue}`}><div className="flex items-center gap-1.5"><Icon className="shrink-0" /><p className="truncate text-[9px] font-black opacity-70">{label}</p></div><p className="mt-1 line-clamp-2 text-xs font-black leading-5">{value}</p></div>;
}

function InfoPanel({ title, icon: Icon, tone, children }) {
  const tones = { blue: "border-blue-100 bg-gradient-to-l from-blue-50/80 to-white text-blue-700", violet: "border-violet-100 bg-gradient-to-l from-violet-50/80 to-white text-violet-700", green: "border-emerald-100 bg-gradient-to-l from-emerald-50/80 to-white text-emerald-700", orange: "border-orange-100 bg-gradient-to-l from-orange-50/80 to-white text-orange-700" };
  return <section className={`overflow-hidden rounded-[16px] border bg-white shadow-[0_7px_20px_rgba(15,23,42,0.05)] ${tones[tone] || tones.blue}`}><div className="flex items-center justify-between border-b border-current/10 px-3 py-2" dir="rtl"><h2 className="text-sm font-black">{title}</h2><span className="flex size-8 items-center justify-center rounded-lg bg-white text-lg shadow-sm"><Icon /></span></div><div className="divide-y divide-slate-100 px-3">{children}</div></section>;
}

function InfoRow({ label, value, strong = false, badgeTone, valueTone }) {
  const badge = badgeTone === "orange" ? "bg-orange-100 text-orange-700" : "bg-violet-100 text-violet-700";
  const valueClass = valueTone === "green" ? "text-emerald-700" : valueTone === "orange" ? "text-orange-700" : "text-slate-950";
  return <div className="flex min-h-9 items-center justify-between gap-3 py-1.5" dir="rtl"><span className="text-xs font-black text-slate-500">{label}</span>{badgeTone ? <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${badge}`}>{value}</span> : <span className={`${strong ? "text-lg" : "text-sm"} font-black ${valueClass}`}>{value}</span>}</div>;
}

function MiniStat({ label, value, tone }) {
  const styles = tone === "green" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : tone === "orange" ? "border-orange-100 bg-orange-50 text-orange-700" : "border-blue-100 bg-blue-50 text-blue-700";
  return <div className={`rounded-xl border p-2 text-center ${styles}`}><p className="text-[9px] font-black opacity-70">{label}</p><p className="mt-1 text-base font-black">{formatNumber(value)}</p></div>;
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black text-slate-700">{label}</span>{children}</label>;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("فایل لوستل ونه شول."));
    reader.readAsDataURL(file);
  });
}
