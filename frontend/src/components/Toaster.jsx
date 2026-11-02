import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { ToastContext } from "../toast-context.js";

const LOOKS = {
  success: { icon: CheckCircle2, style: "border-emerald-200 bg-emerald-50/95 text-emerald-900", iconStyle: "text-emerald-600" },
  error: { icon: TriangleAlert, style: "border-rose-200 bg-rose-50/95 text-rose-900", iconStyle: "text-rose-600" },
  info: { icon: Info, style: "border-brand-200 bg-white/95 text-ink-900", iconStyle: "text-brand-600" },
};

// Errors stay up longer: they usually need reading, not just noticing.
const LIFETIME = { success: 4000, info: 4000, error: 7000 };

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind, message) => {
      if (!message) return;
      const id = nextId.current++;
      // Keep the newest four; a burst of clicks shouldn't bury the page.
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), LIFETIME[kind]);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6 md:bottom-6 md:items-end"
      >
        {toasts.map((toast) => {
          const look = LOOKS[toast.kind];
          const Icon = look.icon;
          return (
            <div
              key={toast.id}
              role={toast.kind === "error" ? "alert" : "status"}
              className={`animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${look.style}`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${look.iconStyle}`} />
              <p className="flex-1 font-medium">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="-mr-1 rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
