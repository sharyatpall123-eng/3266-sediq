export default function StatCard({ title, value, icon: Icon, tone = "blue", caption }) {
  const tones = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    purple: "bg-violet-100 text-violet-700",
    cyan: "bg-cyan-100 text-cyan-700",
  };

  return (
    <CardLike>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-500">{title}</p>
          <p className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">{value}</p>
          {caption ? <p className="mt-2 text-xs font-semibold text-slate-400">{caption}</p> : null}
        </div>
        <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl ${tones[tone] || tones.blue}`}>
          {Icon ? <Icon /> : null}
        </div>
      </div>
    </CardLike>
  );
}

function CardLike({ children }) {
  return <div className="glass-card p-5 transition duration-200 hover:-translate-y-1 hover:shadow-2xl">{children}</div>;
}
