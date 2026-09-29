export default function Loading({ label = "معلومات راوړل کېږي..." }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-slate-500">
      <div className="size-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
      <p className="text-sm font-bold">{label}</p>
    </div>
  );
}
