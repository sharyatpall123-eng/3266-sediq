import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";

const LOCK_KEY = "wmsModalLockCount";

function getLockCount() {
  return Number(document.body.dataset[LOCK_KEY] || 0);
}

function lockPageScroll() {
  const body = document.body;
  const html = document.documentElement;
  const current = getLockCount();

  if (current === 0) {
    body.dataset.wmsPreviousOverflow = body.style.overflow || "";
    html.dataset.wmsPreviousOverflow = html.style.overflow || "";
  }

  body.dataset[LOCK_KEY] = String(current + 1);
  body.style.overflow = "hidden";
  html.style.overflow = "hidden";
}

function unlockPageScroll() {
  const body = document.body;
  const html = document.documentElement;
  const next = Math.max(0, getLockCount() - 1);

  if (next > 0) {
    body.dataset[LOCK_KEY] = String(next);
    return;
  }

  delete body.dataset[LOCK_KEY];
  body.style.overflow = body.dataset.wmsPreviousOverflow || "";
  html.style.overflow = html.dataset.wmsPreviousOverflow || "";
  delete body.dataset.wmsPreviousOverflow;
  delete html.dataset.wmsPreviousOverflow;
}

export default function Modal({ open, onClose, title, children, size = "lg" }) {
  useEffect(() => {
    if (!open) return undefined;

    const handler = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handler);
    lockPageScroll();

    return () => {
      document.removeEventListener("keydown", handler);
      unlockPageScroll();
    };
  }, [open, onClose]);

  // Recover from an old stale body lock left by Fast Refresh or a previous version.
  useEffect(() => {
    if (!open && getLockCount() === 0) {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
  }, [open]);

  if (!open) return null;

  const widths = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] grid h-[100dvh] w-[100vw] place-items-center overflow-hidden bg-slate-950/55 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        className={`animate-scale-in flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-2xl sm:max-h-[calc(100dvh-40px)] sm:rounded-[26px] ${widths[size] || widths.lg}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-3.5">
          <h2 className="text-base font-black text-slate-950 sm:text-lg">{title}</h2>
          <button type="button" className="icon-button size-9" onClick={onClose} aria-label="Close modal">
            <FiX />
          </button>
        </header>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {children}
        </div>
      </section>
    </div>
    ,
    document.body,
  );
}
