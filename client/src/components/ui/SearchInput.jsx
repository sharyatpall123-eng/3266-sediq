import { FiSearch } from "react-icons/fi";

export default function SearchInput({ value, onChange, placeholder = "لټون...", className = "" }) {
  return (
    <label className={`relative block ${className}`}>
      <FiSearch className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
      <input className="field pr-11" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
