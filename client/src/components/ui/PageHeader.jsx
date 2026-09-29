const headerImageByTitle = {
  "راپورونه": "/header-images/header-daisy.jpeg",
  "تنظیمات": "/header-images/header-daisy.jpeg",
  "Users": "/header-images/header-daisy.jpeg",
  "خبرتیاوې": "/header-images/header-daisy.jpeg",
};

export default function PageHeader({ title, subtitle, actions }) {
  const image = headerImageByTitle[title] || "/header-images/header-daisy.jpeg";

  return (
    <header
      className="page-image-header wms-photo-hero relative mb-4 overflow-hidden rounded-[20px] px-4 py-3 text-white shadow-[0_10px_28px_rgba(15,23,42,0.12)] sm:px-5 sm:py-4"
      style={{ backgroundImage: `url('${image}')` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/76 via-blue-950/48 to-slate-900/18" />
      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title !text-white">{title}</h1>
          {subtitle ? <p className="page-subtitle !mt-1 !text-white/85">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
