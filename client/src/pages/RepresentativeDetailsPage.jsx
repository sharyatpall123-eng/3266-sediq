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

  FiImage,

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

import { representativeService } from "../services/wmsService";

import { formatDate, formatNumber } from "../utils/format";



const today = () => new Date().toISOString().slice(0, 10);

const roundMoney = (value) =>

  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;



const fileToDataUrl = (file) =>

  new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));

    reader.onerror = () => reject(new Error("عکس لوستل نه شو."));

    reader.readAsDataURL(file);

  });




const dateOnlyUtc = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const getPassedDays = (delivery) => {
  const startMs = dateOnlyUtc(delivery?.delivery_date || delivery?.date);
  if (startMs === null) return 0;

  const quantity = Math.max(0, Number(delivery?.quantity || 0));
  const delivered = Math.min(
    quantity,
    Math.max(0, Number(delivery?.delivered_quantity ?? delivery?.delivered ?? 0)),
  );
  const completed = quantity > 0 && delivered >= quantity;
  const history = Array.isArray(delivery?.delivery_history) ? delivery.delivery_history : [];
  const finalHistoryDate = history.length ? history[0]?.date || history[0]?.created_at : "";
  const endValue = completed
    ? delivery?.last_delivered_at || finalHistoryDate || delivery?.updated_at || today()
    : today();
  const endMs = dateOnlyUtc(endValue) ?? dateOnlyUtc(today());

  return Math.max(0, Math.floor((endMs - startMs) / 86400000));
};

const passedDaysLabel = (delivery) => {
  const days = getPassedDays(delivery);
  return days === 1 ? "1 ورځ" : `${formatNumber(days)} ورځې`;
};

const emptyDelivery = {

  quantity: "",

  description: "",

  details: "",

  shop_address: "",

  delivery_date: today(),

  rent_type: "",

  rent_rate: "",

  rent_amount: "",

  weight_kg: "",

  cbm: "",

  price: "",

  delivered_quantity: "",

  bill_name: "",

  bill_type: "",

  bill_data_url: "",

  bill_uploaded_at: "",

};



const getRentType = (delivery) => {

  if (delivery?.rent_type === "ton" || delivery?.rent_type === "cbm") {

    return delivery.rent_type;

  }

  if (Number(delivery?.cbm || 0) > 0) return "cbm";

  if (Number(delivery?.weight_kg || delivery?.weight || 0) > 0) return "ton";

  return "";

};



const getFreightDetails = (delivery) => {

  const rentType = getRentType(delivery);

  const weightKg = Number(delivery?.weight_kg || delivery?.weight || 0);

  const tons = weightKg / 1000;

  const cbm = Number(delivery?.cbm || 0);

  const baseValue = rentType === "ton" ? tons : rentType === "cbm" ? cbm : 0;

  const savedTotal = Number(delivery?.rent_amount || delivery?.freight || 0);

  const savedRate = Number(delivery?.rent_rate || 0);

  const rate = savedRate > 0 ? savedRate : baseValue > 0 ? savedTotal / baseValue : 0;

  const total = savedTotal > 0 ? savedTotal : roundMoney(baseValue * rate);



  return {

    rentType,

    rate: roundMoney(rate),

    total: roundMoney(total),

    tons: roundMoney(tons),

    cbm,

  };

};



export default function RepresentativeDetailsPage() {

  const { id } = useParams();

  const navigate = useNavigate();

  const [company, setCompany] = useState(null);

  const [deliveries, setDeliveries] = useState([]);

  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(null);

  const [selectedDelivery, setSelectedDelivery] = useState(null);

  const [search, setSearch] = useState("");



  const load = useCallback(async () => {

    setLoading(true);

    try {

      const response = await representativeService.get(id);

      const representative = response?.representative || response?.company || response;

      setCompany(representative || null);

      setDeliveries(response?.deliveries || representative?.deliveries || []);

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

      [item.description, item.details, item.shop_address].some((value) =>

        String(value || "").toLowerCase().includes(query),

      ),

    );

  }, [deliveries, search]);



  const calculated = useMemo(() => {

    const deliveryTotals = deliveries.reduce(

      (acc, item) => {

        const quantity = Number(item.quantity || 0);

        const delivered = Math.min(

          quantity,

          Number(item.delivered_quantity || item.delivered || 0),

        );

        acc.total += quantity;

        acc.delivered += delivered;

        acc.remaining += Math.max(0, quantity - delivered);

        acc.value += Number(item.price || item.goods_price || 0);

        return acc;

      },

      { total: 0, delivered: 0, remaining: 0, value: 0 },

    );



    return {

      total: deliveryTotals.total,

      delivered: deliveryTotals.delivered,

      remaining: deliveryTotals.remaining,

      value: deliveryTotals.value,

    };

  }, [deliveries]);



  const markDelivered = async (delivery) => {

    const quantity = Number(delivery.quantity || 0);

    if (Number(delivery.delivered_quantity || 0) >= quantity) {

      toast("دا مال مخکې بشپړ تسلیم شوی دی.");

      return;

    }



    try {

      await representativeService.updateDelivery(id, delivery.id, {

        delivered_quantity: quantity,

      });

      toast.success("مال بشپړ تسلیم شو.");

      await load();

    } catch (error) {

      toast.error(getErrorMessage(error));

    }

  };



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



  if (loading) {

    return (

      <div className="page-enter p-6">

        <Loading />

      </div>

    );

  }



  if (!company) {

    return (

      <div className="page-enter space-y-4">

        <button

          type="button"

          onClick={() => navigate("/representatives")}

          className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 font-black text-slate-700 shadow-sm"

        >

          <FiArrowLeft /> بېرته

        </button>

        <Card>

          <EmptyState title="استازی پیدا نه شو" />

        </Card>

      </div>

    );

  }



  const summaryCards = [

    {

      title: "ټول مال",

      value: calculated.total,

      caption: "ټول ثبت شوی مال",

      tone: "blue",

      icon: FiPackage,

    },

    {

      title: "تسلیم شوی",

      value: calculated.delivered,

      caption: "په بریالیتوب تسلیم شوی",

      tone: "green",

      icon: FiCheckCircle,

    },

    {

      title: "لاره کې مال",

      value: calculated.remaining,

      caption: "ټول تعداد منفي تسلیم شوی",

      tone: "orange",

      icon: FiTruck,

    },

    {

      title: "ارزښت جنس",

      value: `${formatNumber(calculated.value)} ؋`,

      caption: "د ټولو اجناسو قیمت",

      tone: "purple",

      icon: FiDollarSign,

      formatted: true,

    },

  ];



  return (

    <div className="page-enter min-w-0 space-y-5">

      <button

        type="button"

        onClick={() => navigate("/representatives")}

        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"

      >

        <FiArrowLeft /> بېرته استازو ته

      </button>



      <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)] sm:rounded-[36px]">

        <div className="relative min-h-[220px] overflow-hidden bg-gradient-to-r from-blue-950 via-blue-700 to-cyan-500 px-4 py-6 text-white sm:min-h-[250px] sm:px-8 sm:py-8">

          <DetailsHeaderArtwork />

          <div className="relative z-10 flex min-h-[168px] flex-col items-center justify-center text-center sm:min-h-[185px]">

            <span className="flex size-16 items-center justify-center rounded-[22px] border border-white/70 bg-white text-3xl text-blue-700 shadow-[0_18px_38px_rgba(15,23,42,0.3)] sm:size-20 sm:text-4xl">

              <FiTruck />

            </span>

            <h1 className="mt-4 max-w-full break-words px-4 text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_12px_rgba(15,23,42,0.45)] sm:text-5xl">

              {company.name}

            </h1>

            <p dir="ltr" className="mt-3 flex items-center justify-center gap-2 text-base font-black text-blue-50 sm:text-xl">

              <FiPhone />

              <span>{company.phone || "—"}</span>

            </p>

          </div>

        </div>



        <div className="relative z-20 -mt-5 grid grid-cols-2 gap-3 px-3 pb-5 sm:-mt-7 sm:gap-4 sm:px-6 sm:pb-7 xl:grid-cols-4">

          {summaryCards.map((item) => (

            <SummaryCard key={item.title} {...item} />

          ))}

        </div>

      </section>



      <Card className="min-w-0 overflow-hidden p-0">

        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between sm:p-5">

          <div dir="rtl" className="text-right">

            <h2 className="text-xl font-black text-slate-950 sm:text-2xl">د مالونو لیست</h2>

            <p className="mt-1 text-sm font-semibold text-slate-500">

              تعداد، باقي لاره کې، جنس نوم، دکان ادرس او تاریخ

            </p>

          </div>



          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

            <label className="flex h-11 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 sm:w-72">

              <FiSearch className="shrink-0 text-slate-400" />

              <input

                value={search}

                onChange={(event) => setSearch(event.target.value)}

                className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold outline-none"

                placeholder="جنس نوم یا دکان ادرس..."

                dir="rtl"

              />

            </label>



            <button

              type="button"

              onClick={() => {

                setSelectedDelivery(null);

                setModal("add");

              }}

              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 to-cyan-500 px-5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 sm:text-base"

            >

              <FiPlus /> نوی مال ثبت

            </button>

          </div>

        </div>



        <div className="p-3 sm:p-5">

          {filteredDeliveries.length === 0 ? (

            <div className="py-10">

              <EmptyState title="د مال ریکارډ پیدا نه شو" />

            </div>

          ) : (

            <GoodsList

              representativeId={id}

              deliveries={filteredDeliveries}

              onDetails={(delivery) =>

                navigate(`/representatives/${id}/goods/${delivery.id}`)

              }

              onEdit={(delivery) => {

                setSelectedDelivery(delivery);

                setModal("edit");

              }}

              onDelete={removeDelivery}

            />

          )}

        </div>

      </Card>



      <Modal

        open={modal === "add" || modal === "edit"}

        onClose={() => {

          setModal(null);

          setSelectedDelivery(null);

        }}

        title={modal === "edit" ? "د مال معلومات اصلاح" : "نوی مال ثبت"}

        size="lg"

      >

        <DeliveryForm

          representativeId={id}

          delivery={selectedDelivery}

          onCancel={() => {

            setModal(null);

            setSelectedDelivery(null);

          }}

          onSaved={async () => {

            setModal(null);

            setSelectedDelivery(null);

            await load();

          }}

        />

      </Modal>

    </div>

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

    <article className={`min-w-0 rounded-[22px] border bg-white p-3.5 shadow-[0_18px_38px_rgba(15,23,42,0.14)] sm:rounded-[26px] sm:p-5 ${style[0]}`}>

      <div className="flex items-center gap-3">

        <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl shadow-sm sm:size-14 sm:text-2xl ${style[1]}`}>

          <Icon />

        </span>

        <div dir="rtl" className="min-w-0 flex-1 text-right">

          <p className="truncate text-xs font-black text-slate-700 sm:text-sm">{title}</p>

          <p className={`mt-1 truncate text-xl font-black tracking-tight sm:text-[1.65rem] ${style[2]}`}>

            {formatted ? value : formatNumber(value)}

          </p>

          <p className="mt-1 truncate text-[10px] font-bold text-slate-400 sm:text-xs">{caption}</p>

        </div>

      </div>

    </article>

  );

}



function GoodsList({ deliveries, onDetails, onEdit, onDelete }) {

  const [page, setPage] = useState(1);

  const [previewImage, setPreviewImage] = useState(null);

  const pageSize = 10;

  const totalPages = Math.max(1, Math.ceil(deliveries.length / pageSize));

  const currentPage = Math.min(page, totalPages);

  const start = (currentPage - 1) * pageSize;

  const visible = deliveries.slice(start, start + pageSize);



  useEffect(() => {

    if (page > totalPages) setPage(totalPages);

  }, [page, totalPages]);



  return (

    <>

      <div className="hidden overflow-x-auto lg:block">

        <div dir="rtl" className="min-w-[1110px]">

          <div className="grid grid-cols-[70px_120px_135px_1.4fr_1.7fr_150px_240px] items-center rounded-2xl bg-gradient-to-l from-blue-950 via-blue-800 to-blue-700 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-900/10">

            <div className="text-center">#</div>

            <div className="text-center">تعداد</div>

            <div className="text-center">باقي (لاره کې)</div>

            <div className="text-right">جنس نوم</div>

            <div className="text-right">دکان ادرس</div>

            <div className="text-center">تاریخ</div>

            <div className="text-center">عملیات</div>

          </div>



          <div className="mt-2 space-y-2">

            {visible.map((delivery, index) => {

              const quantity = Number(delivery.quantity || 0);

              const delivered = Math.min(

                quantity,

                Number(delivery.delivered_quantity || delivery.delivered || 0),

              );

              const remaining = Math.max(0, quantity - delivered);



              return (

                <article

                  key={delivery.id}

                  onDoubleClick={() => onDetails(delivery)}

                  className="grid grid-cols-[70px_120px_135px_1.4fr_1.7fr_150px_240px] items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_7px_20px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_28px_rgba(37,99,235,0.10)]"

                >

                  <div className="text-center text-sm font-black text-slate-500">

                    {String(start + index + 1).padStart(2, "0")}

                  </div>



                  <div className="text-center">

                    <span className="inline-flex min-w-16 justify-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-base font-black text-violet-700">

                      {formatNumber(quantity)}

                    </span>

                  </div>



                  <div className="text-center">

                    <span className={`inline-flex min-w-20 justify-center rounded-xl border px-3 py-2 text-base font-black ${remaining > 0 ? "border-orange-200 bg-orange-50 text-orange-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>

                      {formatNumber(remaining)}

                    </span>

                  </div>



                  <div className="min-w-0 text-right">

                    <p className="truncate text-base font-black text-slate-950">

                      {delivery.description || "—"}

                    </p>

                    <p className="mt-1 truncate text-xs font-semibold text-slate-400">

                      {delivery.details || "تفصیل نشته"}

                    </p>

                  </div>



                  <div className="flex min-w-0 items-center justify-end gap-2 text-right">

                    <FiMapPin className="shrink-0 text-blue-500" />

                    <span className="truncate text-sm font-bold text-slate-600">

                      {delivery.shop_address || "—"}

                    </span>

                  </div>



                  <div className="text-center">
                    <p className="text-sm font-black text-slate-800">
                      {formatDate(delivery.delivery_date || delivery.date)}
                    </p>
                    <p className={`mt-1 text-[10px] font-black ${remaining > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                      {passedDaysLabel(delivery)}
                    </p>
                  </div>



                  <div className="flex items-center justify-center gap-2">

                    {delivery.bill_data_url ? (

                      <button

                        type="button"

                        onClick={(event) => {

                          event.stopPropagation();

                          setPreviewImage({

                            src: delivery.bill_data_url,

                            name: delivery.bill_name || delivery.description || "د مال عکس",

                          });

                        }}

                        className="flex size-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"

                        aria-label="د مال عکس"

                        title="د مال عکس"

                      >

                        <FiImage />

                      </button>

                    ) : null}

                    <button

                      type="button"

                      onClick={() => onDetails(delivery)}

                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-700 transition hover:bg-blue-100"

                    >

                      <FiEye /> جزئیات

                    </button>

                    <button

                      type="button"

                      onClick={() => onEdit(delivery)}

                      className="flex size-10 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100"

                      aria-label="Edit"

                    >

                      <FiEdit3 />

                    </button>

                    <button

                      type="button"

                      onClick={() => onDelete(delivery)}

                      className="flex size-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"

                      aria-label="Delete"

                    >

                      <FiTrash2 />

                    </button>

                  </div>

                </article>

              );

            })}

          </div>

        </div>

      </div>



      <div className="grid gap-3 lg:hidden">

        {visible.map((delivery, index) => {

          const quantity = Number(delivery.quantity || 0);

          const delivered = Math.min(

            quantity,

            Number(delivery.delivered_quantity || delivery.delivered || 0),

          );

          const remaining = Math.max(0, quantity - delivered);



          return (

            <article key={delivery.id} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)]">

              <div className="flex items-center gap-3 bg-gradient-to-l from-blue-700 to-cyan-500 px-3 py-3 text-white" dir="rtl">

                <span className="flex size-10 items-center justify-center rounded-xl bg-white text-blue-700 shadow-md">

                  <FiBox />

                </span>

                <div className="min-w-0 flex-1 text-right">

                  <p className="text-[10px] font-black text-blue-100">{String(start + index + 1).padStart(2, "0")}</p>

                  <h3 className="truncate text-base font-black">{delivery.description || "—"}</h3>

                </div>

              </div>



              <div className="grid grid-cols-2 gap-2 p-3" dir="rtl">

                <MiniBox label="تعداد" value={formatNumber(quantity)} tone="violet" />

                <MiniBox label="باقي (لاره کې)" value={formatNumber(remaining)} tone="orange" />

                <MiniBox label="دکان ادرس" value={delivery.shop_address || "—"} tone="blue" />

                <MiniBox
                  label="تاریخ / تېرې ورځې"
                  value={`${formatDate(delivery.delivery_date || delivery.date)} • ${passedDaysLabel(delivery)}`}
                  tone="slate"
                />

              </div>



              <div className={`grid ${delivery.bill_data_url ? "grid-cols-[1fr_42px_42px_42px]" : "grid-cols-[1fr_42px_42px]"} gap-2 border-t border-slate-100 p-3`}>

                <button type="button" onClick={() => onDetails(delivery)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 text-xs font-black text-white">

                  <FiEye /> جزئیات

                </button>

                {delivery.bill_data_url ? (

                  <button

                    type="button"

                    onClick={() => setPreviewImage({ src: delivery.bill_data_url, name: delivery.bill_name || delivery.description || "د مال عکس" })}

                    className="flex h-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700"

                    aria-label="د مال عکس"

                    title="د مال عکس"

                  >

                    <FiImage />

                  </button>

                ) : null}

                <button type="button" onClick={() => onEdit(delivery)} className="flex h-10 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700">

                  <FiEdit3 />

                </button>

                <button type="button" onClick={() => onDelete(delivery)} className="flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600">

                  <FiTrash2 />

                </button>

              </div>

            </article>

          );

        })}

      </div>



      <Modal

        open={Boolean(previewImage)}

        onClose={() => setPreviewImage(null)}

        title={previewImage?.name || "د مال عکس"}

        size="lg"

      >

        <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-2xl bg-slate-50 p-2 sm:p-4">

          {previewImage?.src ? (

            <img

              src={previewImage.src}

              alt={previewImage.name || "د مال عکس"}

              className="max-h-[72vh] max-w-full rounded-xl object-contain shadow-sm"

            />

          ) : null}

        </div>

      </Modal>



      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

        <p className="text-sm font-bold text-slate-500">

          {deliveries.length === 0

            ? "0 ریکارډ"

            : `${start + 1} تر ${Math.min(start + pageSize, deliveries.length)} د ${deliveries.length} ریکارډونو څخه`}

        </p>

        <div className="flex items-center justify-center gap-2" dir="ltr">

          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white font-black disabled:opacity-40">‹</button>

          {Array.from({ length: totalPages }, (_, index) => index + 1)

            .slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))

            .map((pageNumber) => (

              <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={`flex size-9 items-center justify-center rounded-lg text-sm font-black ${currentPage === pageNumber ? "bg-blue-700 text-white shadow-md" : "border border-slate-200 bg-white text-slate-700"}`}>

                {pageNumber}

              </button>

            ))}

          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white font-black disabled:opacity-40">›</button>

        </div>

        <p className="text-sm font-black text-slate-700">پاڼه {currentPage} له {totalPages}</p>

      </div>

    </>

  );

}



function MiniBox({ label, value, tone }) {

  const tones = {

    violet: "border-violet-100 bg-violet-50 text-violet-700",

    orange: "border-orange-100 bg-orange-50 text-orange-700",

    blue: "border-blue-100 bg-blue-50 text-blue-700",

    slate: "border-slate-200 bg-slate-50 text-slate-600",

  };

  return (

    <div className={`min-h-[66px] rounded-xl border p-2.5 text-right ${tones[tone] || tones.slate}`}>

      <p className="text-[10px] font-black opacity-70">{label}</p>

      <p className="mt-1 line-clamp-2 text-sm font-black leading-5">{value}</p>

    </div>

  );

}



function DeliveryForm({ representativeId, delivery, onCancel, onSaved }) {

  const [form, setForm] = useState(() => {

    const initialRentType = getRentType(delivery);

    const freight = getFreightDetails(delivery);

    return {

      ...emptyDelivery,

      ...(delivery || {}),

      delivery_date: delivery?.delivery_date || delivery?.date || today(),

      rent_type: initialRentType,

      rent_rate: delivery?.rent_rate ?? (freight.rate || ""),

      rent_amount: delivery?.rent_amount ?? delivery?.freight ?? "",

      weight_kg: delivery?.weight_kg ?? delivery?.weight ?? "",

      delivered_quantity: delivery?.delivered_quantity ?? delivery?.delivered ?? "",

    };

  });

  const [saving, setSaving] = useState(false);



  const quantity = Number(form.quantity || 0);

  const delivered = Math.min(quantity, Number(form.delivered_quantity || 0));

  const remaining = Math.max(0, quantity - delivered);

  const weightKg = Number(form.weight_kg || 0);

  const tons = weightKg / 1000;

  const cbm = Number(form.cbm || 0);

  const rentRate = Number(form.rent_rate || 0);

  const rentBase = form.rent_type === "ton" ? tons : form.rent_type === "cbm" ? cbm : 0;

  const calculatedRent = roundMoney(rentBase * rentRate);



  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const chooseRentType = (rentType) =>

    setForm((current) => ({

      ...current,

      rent_type: rentType,

      rent_rate: current.rent_type === rentType ? current.rent_rate : "",

    }));



  const readGoodsImage = async (file) => {

    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.type)) {

      toast.error("یوازې JPG، PNG یا WEBP عکس انتخاب کړئ.");

      return;

    }

    if (file.size > 2 * 1024 * 1024) {

      toast.error("عکس باید له 2MB څخه کوچنی وي.");

      return;

    }



    try {

      const dataUrl = await fileToDataUrl(file);

      setForm((current) => ({

        ...current,

        bill_name: file.name,

        bill_type: file.type,

        bill_data_url: dataUrl,

        bill_uploaded_at: new Date().toISOString(),

      }));

    } catch (error) {

      toast.error(error?.message || "عکس لوستل نه شو.");

    }

  };



  const removeGoodsImage = () =>

    setForm((current) => ({

      ...current,

      bill_name: "",

      bill_type: "",

      bill_data_url: "",

      bill_uploaded_at: "",

    }));



  const submit = async (event) => {

    event.preventDefault();

    if (!form.description.trim()) return toast.error("د جنس نوم ضروري دی.");

    if (!form.shop_address.trim()) return toast.error("دکان ادرس ضروري دی.");

    if (quantity <= 0) return toast.error("تعداد باید له صفر څخه زیات وي.");

    if (!form.rent_type) return toast.error("د نرخ ډول انتخابول ضروري دي.");

    if (rentRate <= 0) return toast.error("فی ټن یا فی CBM نرخ ولیکئ.");

    if (form.rent_type === "ton" && weightKg <= 0) return toast.error("د ټن حساب لپاره وزن ضروري دی.");

    if (form.rent_type === "cbm" && cbm <= 0) return toast.error("د CBM حساب لپاره CBM ضروري دی.");

    if (Number(form.delivered_quantity || 0) > quantity) return toast.error("تسلیم شوی تعداد له ټول تعداد زیات نه شي کېدای.");



    const payload = {

      quantity,

      description: form.description.trim(),

      details: form.details.trim(),

      shop_address: form.shop_address.trim(),

      delivery_date: form.delivery_date || today(),

      rent_type: form.rent_type,

      rent_rate: rentRate,

      rent_amount: calculatedRent,

      weight_kg: weightKg,

      cbm,

      price: Number(form.price || 0),

      delivered_quantity: delivered,

      bill_name: form.bill_name || "",

      bill_type: form.bill_type || "",

      bill_data_url: form.bill_data_url || "",

      bill_uploaded_at: form.bill_uploaded_at || "",

    };



    setSaving(true);

    try {

      if (delivery?.id) {

        await representativeService.updateDelivery(representativeId, delivery.id, payload);

        toast.success("د مال معلومات اصلاح شول.");

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

    <form dir="rtl" onSubmit={submit} className="space-y-5">

      <div className="overflow-hidden rounded-[26px] border border-blue-100 bg-gradient-to-l from-blue-950 via-blue-700 to-cyan-500 p-4 text-white shadow-[0_18px_42px_rgba(37,99,235,0.22)] sm:p-5">

        <div className="flex items-center gap-3">

          <span className="flex size-12 items-center justify-center rounded-[18px] border border-white/40 bg-white/95 text-2xl text-blue-700 shadow-xl sm:size-14"><FiTruck /></span>

          <div>

            <h3 className="text-lg font-black sm:text-xl">د لارې مال معلومات</h3>

            <p className="mt-1 text-xs font-bold text-blue-100 sm:text-sm">ټول معلومات منظم او بشپړ ثبت کړئ.</p>

          </div>

        </div>

      </div>



      <div className="grid gap-4 sm:grid-cols-2">

        <Field label="د جنس نوم">

          <input className="field" value={form.description} onChange={(event) => change("description", event.target.value)} placeholder="د جنس نوم" />

        </Field>

        <Field label="دکان ادرس">

          <input className="field" value={form.shop_address} onChange={(event) => change("shop_address", event.target.value)} placeholder="ولایت، ښار، مارکیټ او دکان" />

        </Field>

      </div>



      <Field label="د جنس تفصیل">

        <textarea className="field min-h-24 resize-y" value={form.details} onChange={(event) => change("details", event.target.value)} placeholder="رنګ، سایز، ماډل او نور معلومات" />

      </Field>



      <Field label="د مال عکس (اختیاري)">

        <div className="rounded-[22px] border-2 border-dashed border-violet-200 bg-violet-50/50 p-3">

          {form.bill_data_url ? (
            <div className="flex min-h-28 items-center gap-3 rounded-2xl bg-white p-3">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-violet-100 bg-slate-50">
                <img
                  src={form.bill_data_url}
                  alt={form.bill_name || "د مال عکس"}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-violet-700">
                  {form.bill_name || "عکس انتخاب شوی"}
                </p>
                <p className="mt-1 text-[10px] font-bold text-slate-400">عکس انتخاب شوی</p>
              </div>
              <button
                type="button"
                onClick={removeGoodsImage}
                className="h-9 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-600"
              >
                حذف
              </button>
            </div>
          ) : (

            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl bg-white px-4 text-center font-black text-violet-700 transition hover:bg-violet-50">

              <FiImage className="mb-2 text-2xl" />

              <span>عکس انتخاب کړئ</span>

              <span className="mt-1 text-[10px] font-bold text-slate-400">JPG، PNG یا WEBP — تر 2MB</span>

              <input

                type="file"

                accept="image/jpeg,image/png,image/webp"

                className="hidden"

                onChange={(event) => {

                  const file = event.target.files?.[0];

                  event.target.value = "";

                  readGoodsImage(file);

                }}

              />

            </label>

          )}

        </div>

      </Field>



      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

        <Field label="تعداد"><input type="number" min="0" step="0.01" className="field" value={form.quantity} onChange={(event) => change("quantity", event.target.value)} /></Field>

        <Field label="تاریخ"><input type="date" className="field" value={form.delivery_date} onChange={(event) => change("delivery_date", event.target.value)} /></Field>

        <Field label="قیمت جنس"><input type="number" min="0" step="0.01" className="field" value={form.price} onChange={(event) => change("price", event.target.value)} /></Field>

        <Field label="وزن (KG)"><input type="number" min="0" step="0.01" className="field" value={form.weight_kg} onChange={(event) => change("weight_kg", event.target.value)} /></Field>

        <Field label="CBM"><input type="number" min="0" step="0.001" className="field" value={form.cbm} onChange={(event) => change("cbm", event.target.value)} /></Field>

        <Field label="تسلیم شوی"><input type="number" min="0" max={quantity || undefined} step="0.01" className="field" value={form.delivered_quantity} onChange={(event) => change("delivered_quantity", event.target.value)} /></Field>

      </div>



      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]">

        <div className="bg-gradient-to-l from-slate-950 via-blue-950 to-blue-800 px-4 py-4 text-white">

          <h4 className="text-base font-black sm:text-lg">د کرایې اتومات حساب</h4>

          <p className="mt-1 text-xs font-bold text-blue-100">فی ټن یا فی CBM حتمي انتخاب کړئ.</p>

        </div>

        <div className="space-y-4 p-4 sm:p-5">

          <div className="grid gap-3 sm:grid-cols-2">

            <RentTypeButton active={form.rent_type === "ton"} title="فی ټن" subtitle="وزن په ټن × نرخ" tone="orange" onClick={() => chooseRentType("ton")} />

            <RentTypeButton active={form.rent_type === "cbm"} title="فی CBM" subtitle="ټول CBM × نرخ" tone="indigo" onClick={() => chooseRentType("cbm")} />

          </div>

          <div className="grid gap-3 sm:grid-cols-3">

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-right">

              <p className="text-[11px] font-black text-slate-500">د حساب مقدار</p>

              <p className="mt-1 text-lg font-black text-slate-900">{form.rent_type === "ton" ? `${formatNumber(roundMoney(tons))} ټن` : form.rent_type === "cbm" ? `${formatNumber(cbm)} CBM` : "—"}</p>

            </div>

            <Field label={form.rent_type === "ton" ? "فی ټن نرخ" : form.rent_type === "cbm" ? "فی CBM نرخ" : "فی واحد نرخ"}>

              <input type="number" min="0" step="0.01" className="field" value={form.rent_rate} onChange={(event) => change("rent_rate", event.target.value)} disabled={!form.rent_type} />

            </Field>

            <div className={`rounded-2xl border p-3 text-right ${form.rent_type === "ton" ? "border-orange-200 bg-orange-50" : form.rent_type === "cbm" ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}>

              <p className="text-[11px] font-black text-slate-500">ټوله کرایه</p>

              <p className={`mt-1 text-xl font-black ${form.rent_type === "ton" ? "text-orange-700" : form.rent_type === "cbm" ? "text-indigo-700" : "text-slate-500"}`}>{formatNumber(calculatedRent)} ؋</p>

            </div>

          </div>

        </div>

      </section>



      <div className="grid gap-3 sm:grid-cols-2">

        <MiniBox label="تسلیم شوی" value={formatNumber(delivered)} tone="blue" />

        <MiniBox label="باقي (لاره کې)" value={formatNumber(remaining)} tone="orange" />

      </div>



      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">

        <Button type="button" variant="secondary" onClick={onCancel}>لغوه</Button>

        <Button type="submit" disabled={saving}>{saving ? "ثبتېږي..." : delivery?.id ? "اصلاح کړه" : "مال ثبت کړه"}</Button>

      </div>

    </form>

  );

}



function RentTypeButton({ active, title, subtitle, tone, onClick }) {

  const activeTone = tone === "orange"

    ? "border-orange-400 bg-gradient-to-l from-orange-500 to-amber-400 text-white shadow-orange-500/25"

    : "border-indigo-500 bg-gradient-to-l from-indigo-700 to-blue-500 text-white shadow-indigo-500/25";

  const idleTone = tone === "orange"

    ? "border-orange-100 bg-orange-50 text-orange-800 hover:border-orange-300"

    : "border-indigo-100 bg-indigo-50 text-indigo-800 hover:border-indigo-300";



  return (

    <button type="button" onClick={onClick} className={`rounded-[22px] border-2 p-4 text-right transition hover:-translate-y-0.5 ${active ? `${activeTone} shadow-lg` : idleTone}`}>

      <p className="text-base font-black">{title}</p>

      <p className={`mt-1 text-xs font-bold ${active ? "text-white/80" : "opacity-70"}`}>{subtitle}</p>

    </button>

  );

}



function DetailsHeaderArtwork() {

  return (

    <div className="pointer-events-none absolute inset-0 overflow-hidden">

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.25),transparent_36%),radial-gradient(circle_at_8%_92%,rgba(34,211,238,0.28),transparent_30%)]" />

      <div className="absolute -right-20 -top-20 size-64 rounded-full border border-white/15 bg-white/10" />

      <div className="absolute -bottom-28 -left-16 size-72 rounded-full bg-blue-950/30 blur-3xl" />

      <svg viewBox="0 0 1100 280" className="absolute inset-0 h-full w-full opacity-55" aria-hidden="true">

        <g opacity="0.24" fill="none" stroke="#dbeafe" strokeWidth="1.6">

          <path d="M20 74L160 30L305 72L450 24L595 70L740 28L1080 82" />

          <path d="M25 222L170 172L320 220L470 165L625 218L780 168L1080 220" />

          <circle cx="160" cy="30" r="5" fill="#fff" />

          <circle cx="450" cy="24" r="5" fill="#fff" />

          <circle cx="740" cy="28" r="5" fill="#fff" />

        </g>

        <g transform="translate(35 110)" opacity="0.76">

          <path d="M0 68h215l-31 45H40z" fill="#dbeafe" />

          <rect x="52" y="18" width="118" height="52" rx="7" fill="#bfdbfe" />

          <rect x="72" y="0" width="76" height="24" rx="6" fill="#eff6ff" />

          <circle cx="58" cy="90" r="5" fill="#2563eb" />

          <circle cx="87" cy="90" r="5" fill="#2563eb" />

        </g>

        <g transform="translate(825 94)" opacity="0.78">

          <rect x="0" y="35" width="132" height="65" rx="8" fill="#1d4ed8" />

          <path d="M132 50h40l23 24v26h-63z" fill="#eff6ff" />

          <rect x="147" y="58" width="21" height="16" rx="3" fill="#7dd3fc" />

          <circle cx="32" cy="106" r="14" fill="#0f172a" />

          <circle cx="153" cy="106" r="14" fill="#0f172a" />

        </g>

      </svg>

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
