import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { testOrdersApi } from "../../api.js";
import { formatDate, formatDateTime } from "../../format.js";
import { useLoader } from "../../hooks.js";
import PrintShell, { Field } from "../../components/PrintShell.jsx";

export default function PrintLabReport() {
  const { id } = useParams();
  const load = useCallback(() => testOrdersApi.get(id), [id]);
  const { data: order, error } = useLoader(load, "Could not load this report.");
  const done = order?.status === "completed";

  return (
    <PrintShell
      title="Lab report"
      ready={Boolean(order)}
      error={error}
      pdf={order && { path: `test-orders/${order.id}/pdf/`, filename: `lab-report-${String(order.id).padStart(6, "0")}.pdf` }}
      meta={
        order && (
          <div className="text-xs text-slate-600">
            <p>Report no. {String(order.id).padStart(6, "0")}</p>
            <p>{formatDate(order.completed_at ?? order.ordered_at)}</p>
          </div>
        )
      }
    >
      {order && (
        <>
          <section className="mt-5 grid grid-cols-2 gap-6 rounded-lg bg-slate-50 p-4 print:bg-white print:p-0">
            <div className="space-y-0.5">
              <Field label="Patient">{order.patient_name}</Field>
              <Field label="Age / Sex">
                {[order.patient_age != null && `${order.patient_age} y`, order.patient_gender].filter(Boolean).join(" / ")}
              </Field>
              <Field label="MRN">{order.patient_mrn}</Field>
            </div>
            <div className="space-y-0.5">
              <Field label="Referred by">{order.doctor_name}</Field>
              <Field label="Ordered">{formatDateTime(order.ordered_at)}</Field>
              <Field label="Reported">{order.completed_at && formatDateTime(order.completed_at)}</Field>
            </div>
          </section>

          <section className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{order.test_category}</p>
            <h2 className="text-xl font-semibold text-slate-900">{order.test_name}</h2>
            {order.instructions && <p className="text-slate-500">{order.instructions}</p>}

            <div className="mt-4 rounded-lg border border-slate-300 p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Result</p>
                {order.result_flag && (
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase ${
                      order.result_flag === "abnormal"
                        ? "border-rose-400 text-rose-700"
                        : "border-emerald-500 text-emerald-700"
                    }`}
                  >
                    {order.result_flag === "abnormal" ? "Needs attention" : "Normal"}
                  </span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-line text-base text-slate-900">
                {done ? order.result : "Result not ready yet."}
              </p>
            </div>
          </section>

          <footer className="mt-24 flex items-end justify-between">
            <p className="text-[11px] text-slate-400">Printed {formatDateTime(new Date())} · MediDesk</p>
            <div className="w-56 border-t border-slate-400 pt-1 text-center text-xs text-slate-500">
              {order.completed_by_name ? `Reported by ${order.completed_by_name}` : "Laboratory"}
            </div>
          </footer>
        </>
      )}
    </PrintShell>
  );
}
