import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, Printer } from "lucide-react";
import { fetchClinic } from "../api.js";
import Button from "./Button.jsx";

// An A4 sheet with the hospital letterhead. On screen it sits on a grey desk with a
// toolbar; printed, only the sheet comes out (see @media print in index.css).
// With ?auto=1 the print dialog opens by itself once `ready` turns true.
export default function PrintShell({ title, meta, ready, error, children }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clinic, setClinic] = useState(null);
  const printed = useRef(false);

  useEffect(() => {
    fetchClinic().then(setClinic).catch(() => setClinic({ name: "MediDesk" }));
  }, []);

  useEffect(() => {
    if (!ready || !clinic || printed.current || params.get("auto") !== "1") return;
    printed.current = true;
    // Let the browser lay the page out before the dialog freezes it.
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [ready, clinic, params]);

  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  function goBack() {
    if (window.opener) window.close();
    else navigate(-1);
  }

  return (
    <div className="min-h-screen bg-slate-200/70 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4">
        <Button variant="secondary" size="sm" onClick={goBack}>
          <ArrowLeft size={14} /> Back
        </Button>
        <Button size="sm" onClick={() => window.print()} disabled={!ready}>
          <Printer size={14} /> Print
        </Button>
      </div>

      <article className="print-sheet mx-auto min-h-[297mm] max-w-[210mm] bg-white px-10 py-9 text-[13px] leading-relaxed text-slate-800 shadow-xl">
        <header className="flex items-start justify-between gap-6 border-b-2 border-teal-700 pb-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-teal-700 p-2 text-white">
              <Activity size={20} />
            </span>
            <div>
              <p className="text-xl font-bold tracking-tight text-teal-800">{clinic?.name ?? "MediDesk"}</p>
              {clinic?.address && <p className="text-xs text-slate-600">{clinic.address}</p>}
              <p className="text-xs text-slate-600">
                {[clinic?.phone, clinic?.email].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold uppercase tracking-widest text-slate-700">{title}</p>
            {meta}
          </div>
        </header>

        {error ? (
          <p className="mt-10 text-center text-rose-600">{error}</p>
        ) : !ready ? (
          <p className="mt-10 text-center text-slate-500">Preparing the document…</p>
        ) : (
          children
        )}
      </article>
    </div>
  );
}

// A label-value pair for the patient and doctor blocks.
export function Field({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <p>
      <span className="text-slate-500">{label}: </span>
      <span className="font-medium text-slate-900">{children}</span>
    </p>
  );
}
