import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiBox,
  FiCalendar,
  FiCheckCircle,
  FiDollarSign,
  FiEdit3,
  FiEye,
  FiMapPin,
  FiPackage,
  FiPhone,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiTruck,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Loading from "../components/ui/Loading";
import Modal from "../components/ui/Modal";
import { getErrorMessage } from "../lib/api";
import { representativeService } from "../Services/wmsService";
import { formatDate, formatNumber } from "../utils/format";

const today = () => new Date().toISOString().slice(0, 10);
const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const emptyDelivery = {
  quantity: "",
  description: "",
  details: "",
  location: "Futian",
  shop_address: "",
  delivery_date: today(),
  rent_type: "",
  rent_rate: "",
  weight_ton: "",
  cbm: "",
  price: "",
};

function getRentType(delivery) {
  if (delivery?.rent_type === "ton" || delivery?.rent_type === "cbm") {
    return delivery.rent_type;
  }
  return Number(delivery?.cbm || 0) > 0 ? "cbm" : "ton";
}

function getFreight(delivery) {
  const rentType = getRentType(delivery);
  const weightKg = Number(delivery?.weight_kg ?? delivery?.weight ?? 0);
  const tons = weightKg / 1000;
  const cbm = Number(delivery?.cbm || 0);
  const base = rentType === "ton" ? tons : cbm;
  const savedTotal = Number(delivery?.rent_amount ?? delivery?.freight ?? 0);
  const savedRate = Number(delivery?.rent_rate || 0);
  const rate = savedRate > 0 ? savedRate : base > 0 ? savedTotal / base : 0;
  return { rentType, tons, cbm, rate, total: savedTotal || roundMoney(base * rate) };
}

function addressText(delivery) {
  const location = String(delivery?.location || "").trim();
  const shopAddress = String(delivery?.shop_address || "").trim();

  if (location && shopAddress) return `${location} • ${shopAddress}`;
  return location || shopAddress || "—";
}

function dateOnlyUtc(value) {
  if (!value) return null;

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;

  return Date.UTC(year, month - 1, day);
}

function completionDate(delivery) {
  const history = Array.isArray(delivery?.delivery_history)
    ? delivery.delivery_history
    : [];

  // The newest delivery-history item is the action that completed the goods.
  // Use the date selected by the user in the delivery form, not created_at.
  const finalEvent = history.find((event) => event?.date || event?.delivery_date);
  if (finalEvent) return finalEvent.date || finalEvent.delivery_date;

  // Fallback for old records created before delivery_history was available.
  return delivery?.last_delivered_at || null;
}

function daysSinceDelivery(delivery) {
  // Start ONLY from the warehouse delivery date selected for this goods record.
  const startDay = dateOnlyUtc(delivery?.delivery_date || delivery?.date);
  if (startDay == null) return 0;

  const quantity = Number(delivery?.quantity || 0);
  const delivered = Math.min(
    quantity,
    Math.max(0, Number(delivery?.delivered_quantity ?? delivery?.delivered ?? 0)),
  );
  const remaining = Math.max(0, quantity - delivered);

  let endDay = null;

  // Stop counting only after ALL goods are delivered.
  // The stop date is the user-selected final delivery date.
  if (quantity > 0 && remaining <= 0) {
    endDay = dateOnlyUtc(completionDate(delivery));
  }

  // If goods are still remaining, count through today.
  if (endDay == null) {
    const now = new Date();
    endDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const elapsed = Math.floor((endDay - startDay) / 86400000);
  if (elapsed < 0) return 0;

  // Inclusive counting: same date = day 1; 10 full days later = day 11.
  return elapsed + 1;
}

export default function RepresentativeDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cachedRepresentative = representativeService.peek?.(id);
  const [company, setCompany] = useState(() => cachedRepresentative?.representative || null);
  const [deliveries, setDeliveries] = useState(() => cachedRepresentative?.deliveries || []);
  const [loading, setLoading] = useState(() => !cachedRepresentative);
  const [modal, setModal] = useState(null);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [search, setSearch] = useState("");
  const [profileEditOpen, setProfileEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!representativeService.peek?.(id)) setLoading(true);
    try {
      const response = await representativeService.get(id);
      setCompany(response?.representative || null);
      setDeliveries(response?.deliveries || []);
    } catch (error) {
      toast.error(getErrorMessage(error, "د استازي معلومات ترلاسه نه شول."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredDeliveries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return deliveries;
    return deliveries.filter((item) =>
      [item.description, item.details, item.shop_address, item.location].some((value) =>
        String(value || "").toLowerCase().includes(query),
      ),
    );
  }, [deliveries, search]);

  const summary = useMemo(
    () =>
      deliveries.reduce(
        (acc, item) => {
          const quantity = Math.max(0, Number(item.quantity || 0));
          const delivered = Math.min(
            quantity,
            Math.max(0, Number(item.delivered_quantity ?? item.delivered ?? 0)),
          );
          const remaining = Math.max(0, quantity - delivered);
          const totalPrice = Math.max(0, Number(item.price ?? item.goods_price ?? 0));
          acc.total += quantity;
          acc.delivered += delivered;
          acc.remaining += remaining;
          // "ارزښت جنس" means only the value of goods that are still in transit.
          // If nothing remains, the value is always zero.
          if (quantity > 0 && remaining > 0 && totalPrice > 0) {
            acc.value += (totalPrice * remaining) / quantity;
          }
          return acc;
        },
        { total: 0, delivered: 0, remaining: 0, value: 0 },
      ),
    [deliveries],
  );

  const removeDelivery = async (delivery) => {
    if (!window.confirm("آیا دا د مال ریکارډ حذف شي؟")) return;
    try {
      await representativeService.removeDelivery(id, delivery.id);
      toast.success("د مال ریکارډ حذف شو.");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  if (loading) return <div className="page-enter p-6"><Loading /></div>;

  if (!company) {
    return (
      <Card className="p-8">
        <EmptyState title="استازی پیدا نه شو" />
      </Card>
    );
  }

  const summaryCards = [
    { title: "ټول مال", value: summary.total, caption: "ټول ثبت شوی مال", tone: "blue", icon: FiPackage },
    { title: "تسلیم شوی", value: summary.delivered, caption: "حقیقي تسلیم شوی مقدار", tone: "green", icon: FiCheckCircle },
    { title: "لاره کې مال", value: summary.remaining, caption: "تر اوسه نه دی تسلیم شوی", tone: "orange", icon: FiTruck },
    { title: "ارزښت جنس", value: `¥ ${formatNumber(roundMoney(summary.value))}`, caption: "یوازې د پاتې مال ارزښت", tone: "purple", icon: FiDollarSign, formatted: true },
  ];

  return (
    <div className="page-enter min-w-0 space-y-5">
      <button
        type="button"
        onClick={() => navigate("/representatives")}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <FiArrowLeft /> بېرته استازو ته
      </button>

      <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_22px_55px_rgba(15,23,42,0.13)]">
        <div className="wms-photo-hero relative min-h-[190px] overflow-hidden px-5 py-5 text-white sm:min-h-[215px] sm:px-8" style={{ backgroundImage: "url('/header-images/header-daisy.jpeg')" }}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/78 via-blue-950/48 to-sky-900/20" />
          <div className="relative z-10 flex min-h-[145px] flex-col items-center justify-center text-center sm:min-h-[165px]">
            <span className="flex size-14 items-center justify-center rounded-[20px] border border-white/70 bg-white text-3xl text-blue-700 shadow-xl sm:size-16">
              <FiTruck />
            </span>
            <h1 className="mt-3 max-w-full break-words px-3 text-3xl font-black drop-shadow sm:text-5xl">{company.name}</h1>
            <p dir="ltr" className="mt-2 flex items-center gap-2 text-base font-black text-blue-50 sm:text-lg"><FiPhone /> {company.phone || "—"}</p>
          </div>
        </div>
        <div className="relative z-30 -mt-14 mb-3 flex justify-center px-3 sm:-mt-16 sm:px-6" dir="rtl">
          <button
            type="button"
            onClick={() => setProfileEditOpen(true)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/70 bg-white/95 px-4 text-sm font-black text-blue-700 shadow-md backdrop-blur-sm transition hover:bg-blue-50"
          >
            <FiEdit3 /> اصلاح
          </button>
        </div>

      <div className="relative z-20 grid grid-cols-2 gap-3 px-3 pb-5 sm:px-6 xl:grid-cols-4">
          {summaryCards.map((item) => <SummaryCard key={item.title} {...item} />)}
        </div>
      </section>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between sm:p-5">
          <div dir="rtl" className="text-right">
            <h2 className="text-xl font-black text-slate-950 sm:text-2xl">د مالونو لیست</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">تعداد، باقي، جنس نوم، دکان ادرس او تاریخ</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 sm:w-72">
              <FiSearch className="shrink-0 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold outline-none" placeholder="جنس نوم یا دکان ادرس..." dir="rtl" />
            </label>
            <button
              type="button"
              onClick={() => { setSelectedDelivery(null); setModal("add"); }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-cyan-500 px-5 text-sm font-black text-white shadow-lg shadow-blue-500/20"
            >
              <FiPlus /> نوی مال ثبت
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-5">
          {filteredDeliveries.length === 0 ? (
            <div className="py-10"><EmptyState title="د مال ریکارډ پیدا نه شو" /></div>
          ) : (
            <GoodsList
              deliveries={filteredDeliveries}
              onDetails={(delivery) => navigate(`/representatives/${id}/goods/${delivery.id}`)}
              onWarmDetails={(delivery) => representativeService.prefetchDelivery?.(id, delivery.id)}
              onEdit={(delivery) => { setSelectedDelivery(delivery); setModal("edit"); }}
              onDelete={removeDelivery}
            />
          )}
        </div>
      </Card>

      <Modal
        open={profileEditOpen}
        onClose={() => setProfileEditOpen(false)}
        title="استازی اصلاح کړه"
        size="sm"
      >
        <RepresentativeProfileEditForm
          company={company}
          onCancel={() => setProfileEditOpen(false)}
          onSaved={async () => {
            setProfileEditOpen(false);
            await load();
          }}
        />
      </Modal>

      <Modal
        open={modal === "add" || modal === "edit"}
        onClose={() => { setModal(null); setSelectedDelivery(null); }}
        title={modal === "edit" ? "د مال معلومات اصلاح" : "نوی مال ثبت"}
        size="md"
      >
        <DeliveryForm
          representativeId={id}
          delivery={selectedDelivery}
          onCancel={() => { setModal(null); setSelectedDelivery(null); }}
          onSaved={async () => { setModal(null); setSelectedDelivery(null); await load(); }}
        />
      </Modal>
    </div>
  );
}


function RepresentativeProfileEditForm({ company, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: company.name || "",
    phone: company.phone || "",
    opening_balance: String(company.opening_balance || ""),
    opening_balance_note: company.opening_balance_note || "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return toast.error("د استازي نوم ضروري دی.");
    setSaving(true);
    try {
      await representativeService.update(company.id, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        opening_balance: Math.max(0, Number(form.opening_balance || 0)),
        opening_balance_note: form.opening_balance_note.trim() || null,
      });
      toast.success("د استازي معلومات او سابقه بقایه اصلاح شول.");
      await onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-3">
      <ProfileField label="د استازي نوم *">
        <input autoFocus required className="field h-11" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </ProfileField>
      <ProfileField label="موبایل نمبر">
        <input dir="ltr" className="field h-11 text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </ProfileField>
      <ProfileField label="سابقه بقایه (USD)">
        <input type="number" min="0" step="0.01" dir="ltr" className="field h-11 text-left" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
      </ProfileField>
      <ProfileField label="د سابقه بقایه نوټ">
        <textarea className="field min-h-20 resize-none" value={form.opening_balance_note} onChange={(e) => setForm({ ...form, opening_balance_note: e.target.value })} />
      </ProfileField>
      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
        <Button type="button" variant="secondary" onClick={onCancel}>لغوه</Button>
        <Button type="submit" disabled={saving}><FiEdit3 /> {saving ? "خوندي کېږي..." : "اصلاح ذخیره کړه"}</Button>
      </div>
    </form>
  );
}

function ProfileField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ title, value, caption, tone, icon: Icon, formatted }) {
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
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-sm sm:size-12 ${style[1]}`}><Icon /></span>
        <div dir="rtl" className="min-w-0 flex-1 text-right">
          <p className="truncate text-xs font-black text-slate-700">{title}</p>
          <p className={`mt-1 truncate text-xl font-black sm:text-2xl ${style[2]}`}>{formatted ? value : formatNumber(value)}</p>
          <p className="wms-representative-summary-caption mt-1 truncate text-[10px] font-bold text-slate-400">{caption}</p>
        </div>
      </div>
    </article>
  );
}

function GoodsList({ deliveries, onDetails, onWarmDetails, onEdit, onDelete }) {
  const [page, setPage] = useState(1);
  const [statusSort, setStatusSort] = useState("all");
  const [showAll, setShowAll] = useState(false);

  const statusOf = (d) => {
    const q = Number(d.quantity || 0);
    const got = Math.min(q, Number(d.delivered_quantity ?? d.delivered ?? 0));
    return q - got <= 0 ? "delivered" : got > 0 ? "partial" : "remaining";
  };

  // Sort ONLY by the delivery/date entered by the user — never by created_at.
  const dateValue = (d) => {
    const value = d.delivery_date || d.date;
    if (!value) return 0;
    const time = new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime();
    return Number.isFinite(time) ? time : 0;
  };

  const packageText = (d) => {
    const value = String(d.package_type || d.packaging_type || d.unit || "carton").toLowerCase();
    if (value === "bag" || value === "bags" || value === "بوجی" || value === "بوجۍ") return "بوجۍ";
    return "کارتنه";
  };

  const selectedDeliveries =
    statusSort === "all"
      ? deliveries
      : deliveries.filter((item) => statusOf(item) === statusSort);

  const sortedDeliveries = [...selectedDeliveries].sort(
    (a, b) => dateValue(b) - dateValue(a),
  );

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sortedDeliveries.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = showAll ? 0 : (currentPage - 1) * pageSize;
  const visible = showAll
    ? sortedDeliveries
    : sortedDeliveries.slice(start, start + pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <>
      <div dir="rtl" className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <select
          value={statusSort}
          onChange={(e) => {
            setStatusSort(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 shadow-sm"
        >
          <option value="all">ټول مالونه</option>
          <option value="remaining">لاره کې</option>
          <option value="delivered">تسلیم شوی</option>
          <option value="partial">نیم تسلیم</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setShowAll((value) => !value);
            setPage(1);
          }}
          className={`h-10 rounded-xl border px-4 text-sm font-black shadow-sm transition ${
            showAll
              ? "border-blue-700 bg-blue-700 text-white"
              : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          {showAll ? "پاڼې وښایه" : "ټول وښایه"}
        </button>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <div dir="rtl" className="min-w-[1080px]">
          <div className="grid grid-cols-[56px_90px_100px_minmax(260px,1.6fr)_minmax(240px,1.35fr)_120px_150px] items-center gap-1 rounded-xl bg-gradient-to-l from-blue-950 via-blue-800 to-blue-700 px-3 py-3 text-xs font-black text-white shadow-lg">
            <div className="text-center">#</div>
            <div className="text-center">تعداد</div>
            <div className="text-center">باقي</div>
            <div className="text-right">جنس نوم</div>
            <div className="text-right">دکان ادرس</div>
            <div className="text-center">تاریخ</div>
            <div className="text-center">عملیات</div>
          </div>

          <div className="mt-2 space-y-1.5">
            {visible.map((delivery, index) => {
              const quantity = Number(delivery.quantity || 0);
              const delivered = Math.min(
                quantity,
                Number(delivery.delivered_quantity ?? delivery.delivered ?? 0),
              );
              const remaining = Math.max(0, quantity - delivered);

              return (
                <article
                  key={delivery.id}
                  className={`grid min-h-[62px] grid-cols-[56px_90px_100px_minmax(260px,1.6fr)_minmax(240px,1.35fr)_120px_150px] items-center gap-1 rounded-xl border px-3 py-2 shadow-sm transition hover:shadow-md ${
                    remaining <= 0
                      ? "border-emerald-200 bg-emerald-50/70"
                      : delivered > 0
                        ? "border-amber-200 bg-amber-50/75"
                        : "border-sky-200 bg-sky-50/75"
                  }`}
                >
                  <div className="text-center text-xs font-black text-slate-500">
                    {String(start + index + 1).padStart(2, "0")}
                  </div>

                  <div className="text-center">
                    <span className="inline-flex min-w-14 justify-center rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-sm font-black text-violet-700">
                      {formatNumber(quantity)}
                    </span>
                  </div>

                  <div className="text-center">
                    <span className={`inline-flex min-w-14 justify-center rounded-lg border px-2 py-1.5 text-sm font-black ${
                      remaining > 0
                        ? "border-orange-200 bg-orange-50 text-orange-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}>
                      {formatNumber(remaining)}
                    </span>
                  </div>

                  <div className="min-w-0 px-2 text-right">
                    <p className="truncate text-sm font-black text-slate-950">
                      {packageText(delivery)} {delivery.description || "—"}
                    </p>
                  </div>

                  <div className="min-w-0 px-2 text-right">
                    <div className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-1.5">
                      <FiMapPin className="mt-0.5 shrink-0 text-blue-500" />
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-black text-blue-600">
                          {delivery.location || "—"}
                        </p>
                        <p className="truncate text-[11px] font-bold leading-5 text-slate-600">
                          {delivery.shop_address || "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center gap-1 text-center">
                    <p className="whitespace-nowrap text-xs font-black text-slate-800">
                      {formatDate(delivery.delivery_date || delivery.date)}
                    </p>
                    <span className={`inline-flex h-5 min-w-[58px] items-center justify-center rounded-md border px-1.5 text-[9px] font-black ${
                      remaining <= 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-blue-200 bg-blue-50 text-blue-700"
                    }`}>
                      {formatNumber(daysSinceDelivery(delivery))}مه ورځ 
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-1.5">
                    <button type="button" onClick={() => onDetails(delivery)} onMouseEnter={() => onWarmDetails?.(delivery)} onFocus={() => onWarmDetails?.(delivery)} onTouchStart={() => onWarmDetails?.(delivery)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-black text-blue-700">
                      <FiEye /> جزئیات
                    </button>
                    <button type="button" onClick={() => onEdit(delivery)} className="flex size-9 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700">
                      <FiEdit3 />
                    </button>
                    <button type="button" onClick={() => onDelete(delivery)} className="flex size-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600">
                      <FiTrash2 />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile / iPad: compact row-style list */}
      <div className="space-y-1.5 lg:hidden">
        {visible.map((delivery, index) => {
          const quantity = Number(delivery.quantity || 0);
          const delivered = Math.min(
            quantity,
            Number(delivery.delivered_quantity ?? delivery.delivered ?? 0),
          );
          const remaining = Math.max(0, quantity - delivered);

          return (
            <article
              key={delivery.id}
              className={`relative min-h-[86px] rounded-xl border px-2.5 py-2 shadow-sm ${
                remaining <= 0
                  ? "border-emerald-200 bg-emerald-100/70"
                  : delivered > 0
                    ? "border-amber-200 bg-amber-100/70"
                    : "border-sky-200 bg-sky-100/70"
              }`}
            >
              <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 px-1 text-[9px] font-black text-slate-500">
                {String(start + index + 1).padStart(2, "0")}
              </span>

              <div dir="rtl" className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-2 pl-8">
                <div className="min-w-0">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-black text-slate-950">
                      <span className="shrink-0 text-violet-700">{formatNumber(quantity)}</span>
                      <span className="text-slate-300">|</span>
                      <span className="min-w-0 truncate">
                        {packageText(delivery)} {delivery.description || "—"}
                      </span>
                    </div>

                    <div className="mt-1 grid min-w-0 grid-cols-[42px_minmax(0,1fr)] items-center gap-1">
                      <div className="text-center">
                        <span className={`inline-flex items-center justify-center gap-0.5 rounded border px-1 py-[2px] ${
                          remaining > 0
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}>
                          <span className="text-[7px] font-black leading-none">پاتې</span>
                          <span className="text-[9px] font-black leading-none">{formatNumber(remaining)}</span>
                        </span>
                      </div>

                      <p className="min-w-0 truncate text-right text-[10px] font-bold text-slate-500" dir="ltr">
                        <FiMapPin className="mr-1 inline text-blue-500" />
                        {delivery.location || "—"}{delivery.shop_address ? `-${delivery.shop_address}` : ""}
                      </p>
                    </div>
                  </div>


                </div>

                <div className="flex flex-col items-end justify-center gap-1">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => onDetails(delivery)} onMouseEnter={() => onWarmDetails?.(delivery)} onFocus={() => onWarmDetails?.(delivery)} onTouchStart={() => onWarmDetails?.(delivery)} className="flex size-7 items-center justify-center rounded-md bg-blue-700 text-white">
                      <FiEye />
                    </button>
                    <button type="button" onClick={() => onEdit(delivery)} className="flex size-7 items-center justify-center rounded-md border border-cyan-200 bg-cyan-50 text-cyan-700">
                      <FiEdit3 />
                    </button>
                    <button type="button" onClick={() => onDelete(delivery)} className="flex size-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600">
                      <FiTrash2 />
                    </button>
                  </div>
                  <div className="flex w-[92px] flex-col items-stretch gap-1">
                    <div className="flex h-5 items-center justify-center rounded border border-slate-200 bg-white/80 px-1">
                      <p className="whitespace-nowrap text-[8px] font-black leading-none text-slate-500">
                        {formatDate(delivery.delivery_date || delivery.date)}
                      </p>
                    </div>
                    <div className={`flex h-5 items-center justify-center rounded border px-1 ${
                      remaining <= 0
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-blue-200 bg-blue-50"
                    }`}>
                      <p className={`whitespace-nowrap text-[8px] font-black leading-none ${
                        remaining <= 0 ? "text-emerald-700" : "text-blue-700"
                      }`}>
                        {formatNumber(daysSinceDelivery(delivery))} ورځې
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-xs font-bold text-slate-500">
          {sortedDeliveries.length === 0
            ? "0 ریکارډ"
            : showAll
              ? `ټول ${sortedDeliveries.length} ریکارډونه`
              : `${start + 1} تر ${Math.min(start + pageSize, sortedDeliveries.length)} د ${sortedDeliveries.length} څخه`}
        </p>

        <div className={`flex items-center gap-1.5 ${showAll ? "opacity-40" : ""}`} dir="ltr">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={showAll || currentPage === 1}
            className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white font-black disabled:opacity-40"
          >
            ‹
          </button>
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-700 text-xs font-black text-white">
            {showAll ? "•" : currentPage}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={showAll || currentPage === totalPages}
            className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white font-black disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>
    </>
  );
}

function CompactValue({ label, value, tone }) {
  const styles = tone === "orange" ? "border-orange-100 bg-orange-50 text-orange-700" : "border-violet-100 bg-violet-50 text-violet-700";
  return <div className={`rounded-lg border px-1.5 py-1 text-center ${styles}`}><p className="text-[8px] font-black opacity-70">{label}</p><p className="mt-0.5 text-xs font-black">{formatNumber(value)}</p></div>;
}

function DeliveryForm({ representativeId, delivery, onCancel, onSaved }) {
  const freight = getFreight(delivery);
  const [form, setForm] = useState(() => ({
    ...emptyDelivery,
    ...(delivery || {}),
    location: delivery?.location || "Futian",
    delivery_date: delivery?.delivery_date || delivery?.date || today(),
    rent_type: delivery ? freight.rentType : "",
    rent_rate: delivery?.rent_rate ?? (freight.rate || ""),
    weight_ton: delivery ? roundMoney(Number(delivery?.weight_kg ?? delivery?.weight ?? 0) / 1000) : "",
  }));
  const [saving, setSaving] = useState(false);

  const quantity = Number(form.quantity || 0);
  const tons = Number(form.weight_ton || 0);
  const weightKg = tons * 1000;
  const cbm = Number(form.cbm || 0);
  const rentRate = Number(form.rent_rate || 0);
  const base = form.rent_type === "ton" ? tons : form.rent_type === "cbm" ? cbm : 0;
  const totalRent = roundMoney(base * rentRate);
  const oldRent = delivery?.id ? roundMoney(getFreight(delivery).total) : 0;
  const accountDifference = delivery?.id ? roundMoney(totalRent - oldRent) : 0;
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.description.trim()) return toast.error("د جنس نوم ضروري دی.");
    if (!form.location) return toast.error("Futian یا Shenzhen انتخاب کړئ.");
    if (!form.shop_address.trim()) return toast.error("دکان بشپړ ادرس ضروري دی.");
    if (quantity <= 0) return toast.error("تعداد باید له صفر څخه زیات وي.");
    if (!form.delivery_date) return toast.error("تاریخ ضروري دی.");
    if (!form.rent_type) return toast.error("د نرخ ډول انتخابول ضروري دي.");
    if (rentRate <= 0) return toast.error("فی ټن یا فی CBM نرخ ولیکئ.");
    if (form.rent_type === "ton" && weightKg <= 0) return toast.error("د ټن حساب لپاره وزن ضروري دی.");
    if (form.rent_type === "cbm" && cbm <= 0) return toast.error("د CBM حساب لپاره CBM ضروري دی.");

    const payload = {
      quantity,
      description: form.description.trim(),
      details: String(form.details || "").trim(),
      location: form.location,
      shop_address: String(form.shop_address || "").trim(),
      delivery_date: form.delivery_date,
      rent_type: form.rent_type,
      rent_rate: rentRate,
      rent_amount: totalRent,
      weight_kg: weightKg,
      cbm,
      price: Number(form.price || 0),
    };

    setSaving(true);
    try {
      if (delivery?.id) {
        await representativeService.updateDelivery(representativeId, delivery.id, payload);

        if (accountDifference < 0) {
          toast.success(`د مال معلومات اصلاح شول — کسر: -$${formatNumber(Math.abs(accountDifference))}`);
        } else if (accountDifference > 0) {
          toast.success(`د مال معلومات اصلاح شول — اضافه: +$${formatNumber(accountDifference)}`);
        } else {
          toast.success("د مال معلومات اصلاح شول.");
        }
      } else {
        await representativeService.delivery(representativeId, payload);
        toast.success("نوی مال ثبت شو.");
      }
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-2 [&_.field]:h-9">
      <div className="flex items-center gap-3 rounded-[16px] border border-blue-100 bg-gradient-to-l from-blue-50 to-cyan-50 p-2.5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-blue-700 text-xl text-white"><FiTruck /></span>
        <div><h3 className="font-black text-slate-950">د لارې مال معلومات</h3><p className="text-xs font-bold text-slate-500">ضروري معلومات په منظم ډول ولیکئ.</p></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="د جنس نوم *"><input className="field h-10" value={form.description} onChange={(event) => change("description", event.target.value)} /></Field>
        <Field label="تعداد *"><input type="number" min="0" step="0.01" className="field h-10" value={form.quantity} onChange={(event) => change("quantity", event.target.value)} /></Field>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-black text-slate-700">موقعیت *</p>
        <div className="grid grid-cols-2 gap-2">
          {["Futian", "Shenzhen"].map((location) => (
            <button key={location} type="button" onClick={() => change("location", location)} className={`h-10 rounded-xl border-2 text-sm font-black ${form.location === location ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`}>{location}</button>
          ))}
        </div>
      </div>

      <Field label="دکان بشپړ ادرس *"><input dir="rtl" className="field h-10" value={form.shop_address} onChange={(event) => change("shop_address", event.target.value)} placeholder="مارکیټ، بلاک، منزل او دکان نمبر" /></Field>
      <Field label="د جنس تفصیل"><textarea className="field min-h-16 resize-none" value={form.details} onChange={(event) => change("details", event.target.value)} /></Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="تاریخ *"><input type="date" className="field h-10" value={form.delivery_date} onChange={(event) => change("delivery_date", event.target.value)} /></Field>
        <Field label="وزن په ټن"><input type="number" min="0" step="0.001" className="field h-10" value={form.weight_ton} onChange={(event) => change("weight_ton", event.target.value)} /></Field>
        <Field label="CBM"><input type="number" min="0" step="0.001" className="field h-10" value={form.cbm} onChange={(event) => change("cbm", event.target.value)} /></Field>
        <Field label="قیمت جنس (CNY ¥)"><input type="number" min="0" step="0.01" className="field h-10" value={form.price} onChange={(event) => change("price", event.target.value)} /></Field>
      </div>

      <section className="rounded-[16px] border border-slate-200 bg-slate-50/70 p-2.5">
        <div className="grid grid-cols-2 gap-2">
          <RentButton active={form.rent_type === "ton"} label="فی ټن" tone="orange" onClick={() => change("rent_type", "ton")} />
          <RentButton active={form.rent_type === "cbm"} label="فی CBM" tone="violet" onClick={() => change("rent_type", "cbm")} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label={form.rent_type === "ton" ? "فی ټن نرخ ($) *" : "فی CBM نرخ ($) *"}><input type="number" min="0" step="0.01" disabled={!form.rent_type} className="field h-10" value={form.rent_rate} onChange={(event) => change("rent_rate", event.target.value)} /></Field>
          <div className={`rounded-xl border p-2.5 text-right ${form.rent_type === "ton" ? "border-orange-200 bg-orange-50 text-orange-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}>
            <p className="text-[10px] font-black opacity-70">ټوله کرایه</p>
            <p className="mt-1 text-lg font-black">$ {formatNumber(totalRent)}</p>
            {delivery?.id && accountDifference !== 0 ? (
              <p className="mt-1 text-[10px] font-black">
                {accountDifference < 0
                  ? `کسر حساب: -$${formatNumber(Math.abs(accountDifference))}`
                  : `اضافه حساب: +$${formatNumber(accountDifference)}`}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
        <Button type="button" variant="secondary" onClick={onCancel}>لغوه</Button>
        <Button type="submit" disabled={saving}>{saving ? "ثبتېږي..." : delivery?.id ? "اصلاح کړه" : "مال ثبت کړه"}</Button>
      </div>
    </form>
  );
}

function RentButton({ active, label, tone, onClick }) {
  const activeClass = tone === "orange" ? "border-orange-400 bg-orange-500 text-white" : "border-violet-500 bg-violet-600 text-white";
  const idleClass = tone === "orange" ? "border-orange-100 bg-orange-50 text-orange-700" : "border-violet-100 bg-violet-50 text-violet-700";
  return <button type="button" onClick={onClick} className={`h-10 rounded-xl border-2 text-sm font-black transition ${active ? activeClass : idleClass}`}>{label}</button>;
}

function HeaderArtwork() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.23),transparent_36%),radial-gradient(circle_at_8%_92%,rgba(34,211,238,0.28),transparent_30%)]" />
      <div className="absolute -right-20 -top-20 size-64 rounded-full border border-white/15 bg-white/10" />
      <div className="absolute -bottom-28 -left-16 size-72 rounded-full bg-blue-950/30 blur-3xl" />
      <svg viewBox="0 0 1100 280" className="absolute inset-0 h-full w-full opacity-45" aria-hidden="true">
        <g opacity="0.25" fill="none" stroke="#dbeafe" strokeWidth="1.6"><path d="M20 74L160 30L305 72L450 24L595 70L740 28L1080 82" /><path d="M25 222L170 172L320 220L470 165L625 218L780 168L1080 220" /></g>
        <g transform="translate(40 105)" opacity="0.75"><path d="M0 68h215l-31 45H40z" fill="#dbeafe" /><rect x="52" y="18" width="118" height="52" rx="7" fill="#bfdbfe" /></g>
        <g transform="translate(825 94)" opacity="0.78"><rect x="0" y="35" width="132" height="65" rx="8" fill="#1d4ed8" /><path d="M132 50h40l23 24v26h-63z" fill="#eff6ff" /><circle cx="32" cy="106" r="14" fill="#0f172a" /><circle cx="153" cy="106" r="14" fill="#0f172a" /></g>
      </svg>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black text-slate-700">{label}</span>{children}</label>;
}