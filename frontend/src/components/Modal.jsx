import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import Alert from "./Alert.jsx";

const WIDTHS = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, innermost last. Escape and Tab belong to the top one only, so a
// confirm opened over a form doesn't close both at once.
const stack = [];
// The page's own overflow, saved when the first dialog opens and put back when the
// last one closes, whatever order they close in.
let pageOverflow = "";

// A dialog over the page. With onSubmit the body is a <form> and the footer sits
// inside it, so a submit button in the footer submits the fields above it.
export default function Modal({
  open,
  title,
  subtitle,
  onClose,
  onSubmit,
  footer,
  error,
  size = "md",
  busy = false,
  children,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;

    const id = Symbol("modal");
    if (stack.length === 0) pageOverflow = document.body.style.overflow;
    stack.push(id);
    const returnTo = document.activeElement;
    const panel = panelRef.current;
    document.body.style.overflow = "hidden";

    // Start on the first field, or the panel itself when there is nothing to fill in.
    const first = panel?.querySelector(
      "[data-autofocus], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])",
    );
    (first ?? panel)?.focus();

    function onKey(event) {
      if (stack[stack.length - 1] !== id) return;

      if (event.key === "Escape" && !busyRef.current) {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }

      if (event.key === "Tab" && panel) {
        const items = [...panel.querySelectorAll(FOCUSABLE)];
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(id), 1);
      if (stack.length === 0) document.body.style.overflow = pageOverflow;
      returnTo?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const Body = onSubmit ? "form" : "div";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="animate-fade absolute inset-0 bg-ink-900/45 backdrop-blur-[2px]"
        onClick={() => !busy && onClose?.()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`animate-rise relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl ${WIDTHS[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-brand-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-ink-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-2 rounded-xl p-2 text-ink-500 transition-colors hover:bg-brand-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <Body onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <Alert>{error}</Alert>
            {children}
          </div>
          {footer && (
            <div className="flex flex-wrap-reverse justify-end gap-2 border-t border-brand-100 bg-brand-50/40 px-5 py-3.5 sm:rounded-b-3xl sm:px-6">
              {footer}
            </div>
          )}
        </Body>
      </div>
    </div>,
    document.body,
  );
}
