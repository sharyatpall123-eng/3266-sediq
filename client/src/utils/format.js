export const formatMoney = (value, currency = "AFN") => {
  const number = Number(value || 0);
  const symbol = currency === "USD" ? "$" : "؋";
  return `${symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number)}`;
};

export const formatNumber = (value) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value || 0));

export const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const stockStatus = (product) => {
  const quantity = Number(product?.quantity || 0);
  const min = Number(product?.min_stock || 0);
  if (quantity <= 0) return { key: "out", label: "خلاص شوی", className: "bg-red-100 text-red-700" };
  if (quantity <= min) return { key: "low", label: "کم سټاک", className: "bg-amber-100 text-amber-700" };
  return { key: "in", label: "موجود", className: "bg-emerald-100 text-emerald-700" };
};
