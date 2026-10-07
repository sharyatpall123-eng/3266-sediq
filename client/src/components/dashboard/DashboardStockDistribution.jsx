import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatNumber } from "../../utils/format";

export default function DashboardStockDistribution({ companies = [] }) {
  const total = companies.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return (
    <article className="wms-dashboard-chart min-w-0 rounded-[26px] border border-white/90 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.11)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-950 sm:text-base">Company Stock Distribution</h2>
          <p className="mt-1 text-[11px] font-semibold text-slate-400">له هر شرکت سره لا څو کارټنه مال پاتې دی</p>
        </div>
        <button type="button" className="text-xl font-black text-slate-500">···</button>
      </div>
      <div className="relative mt-2 h-56 sm:h-60">
        {companies.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={companies} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={1} stroke="#ffffff" strokeWidth={3}>
                  {companies.map((item) => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <Tooltip formatter={(value) => [`${value} cartons`, "Cartons"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-xs font-bold text-slate-400">Total Remaining</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{formatNumber(total)}</p>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-xs font-bold text-slate-400">
            No representative stock data yet
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2 sm:text-xs">
        {companies.map((item) => (
          <div key={item.name} className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-100 px-3 py-2">
            <span className={`size-2.5 shrink-0 rounded-full ${item.dotClass}`} />
            <span className="truncate font-bold text-slate-600">{item.name}</span>
            <span className="ml-auto shrink-0 font-black text-slate-950">{formatNumber(item.value)} ctn</span>
          </div>
        ))}
      </div>
    </article>
  );
}
