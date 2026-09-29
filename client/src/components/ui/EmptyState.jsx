import { FiInbox } from "react-icons/fi";

export default function EmptyState({ title = "هیڅ معلومات نشته", description = "تر اوسه کوم ریکارډ نه دی ثبت شوی." }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-500"><FiInbox /></div>
      <h3 className="mt-4 font-black text-slate-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}
