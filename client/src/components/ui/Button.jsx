const variants = {
  primary: "primary-button",
  secondary: "secondary-button",
  danger: "danger-button",
  ghost: "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950",
  success: "inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-bold text-white shadow-lg shadow-emerald-600/15 transition hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-55",
};

export default function Button({ children, variant = "primary", className = "", type = "button", ...props }) {
  return (
    <button type={type} className={`${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}
