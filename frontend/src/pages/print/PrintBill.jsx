import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { billsApi } from "../../api.js";
import { formatDate, formatDateTime, money } from "../../format.js";
import { useLoader } from "../../hooks.js";
import PrintShell, { Field } from "../../components/PrintShell.jsx";

const TYPE_LABELS = {
  consultation: "Consultation",
  procedure: "Procedure",
  medicine: "Medicine",
  lab: "Lab test",
  room: "Room",
};

const METHOD_LABELS = { cash: "Cash", card: "Card", insurance: "Insurance", transfer: "Transfer" };

export default function PrintBill() {
  const { id } = useParams();
  const load = useCallback(() => billsApi.get(id), [id]);
  const { data: bill, error } = useLoader(load, "Could not load this bill.");

  const items = bill?.items ?? [];
  const balance = Number(bill?.balance ?? 0);

  return (
    <PrintShell
      title="Invoice"
      ready={Boolean(bill)}
      error={error}
      meta={
        bill && (
          <div className="text-xs text-slate-600">
            <p className="font-mono text-sm font-semibold text-slate-900">{bill.invoice_number}</p>
            <p>Issued {formatDate(bill.created_at)}</p>
            {bill.due_date && !bill.paid && <p>Due {formatDate(bill.due_date)}</p>}
          </div>
        )
      }
    >
      {bill && (
        <>
          <section className="mt-5 grid grid-cols-2 gap-6">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Billed to</p>
              <p className="text-base font-semibold text-slate-900">{bill.patient_name}</p>
              <Field label="MRN">{bill.patient_mrn}</Field>
              <Field label="Age / Sex">
                {[bill.patient_age != null && `${bill.patient_age} y`, bill.patient_gender].filter(Boolean).join(" / ")}
              </Field>
              <Field label="Phone">{bill.patient_phone}</Field>
              <Field label="Address">{bill.patient_address}</Field>
            </div>
            <div className="space-y-0.5 text-right">
              {bill.doctor_name && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Visit</p>
                  <p className="font-medium text-slate-900">{bill.doctor_name}</p>
                  <p className="text-slate-600">{bill.visit_date && formatDateTime(bill.visit_date)}</p>
                </>
              )}
              <p
                className={`mt-3 inline-block rotate-[-4deg] rounded border-2 px-3 py-1 text-lg font-bold uppercase tracking-widest ${
                  bill.paid ? "border-emerald-600 text-emerald-700" : "border-rose-500 text-rose-600"
                }`}
              >
                {bill.paid ? "Paid" : Number(bill.amount_paid) > 0 ? "Part paid" : "Unpaid"}
              </p>
            </div>
          </section>

          <table className="mt-6 w-full border-collapse text-left">
            <thead>
              <tr className="bg-teal-700 text-xs uppercase tracking-wider text-white print:bg-teal-700">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit price</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border-b border-slate-200 px-3 py-2">
                    Medical services
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id} className="border-b border-slate-200 print-avoid-break">
                    <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2 text-slate-900">{item.description}</td>
                    <td className="px-3 py-2 text-slate-600">{TYPE_LABELS[item.service_type] ?? item.service_type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(item.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{money(item.line_total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <dl className="w-72 space-y-1 tabular-nums print-avoid-break">
              <Row label="Subtotal" value={money(bill.amount)} />
              {Number(bill.tax) > 0 && <Row label="VAT / tax" value={money(bill.tax)} />}
              {Number(bill.discount) > 0 && <Row label="Discount" value={`− ${money(bill.discount)}`} />}
              <Row label="Total" value={money(bill.total)} strong />
              <Row label="Paid" value={money(bill.amount_paid)} />
              <Row
                label="Balance due"
                value={money(balance)}
                strong
                tone={balance > 0 ? "text-rose-600" : "text-emerald-700"}
              />
            </dl>
          </div>

          {bill.payments?.length > 0 && (
            <section className="mt-6 print-avoid-break">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payments received</h2>
              <table className="mt-1 w-full text-left">
                <tbody>
                  {bill.payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-slate-100">
                      <td className="py-1.5">{formatDateTime(payment.received_at)}</td>
                      <td className="py-1.5">{METHOD_LABELS[payment.method] ?? payment.method}</td>
                      <td className="py-1.5 text-slate-500">{payment.reference || "—"}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{money(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <footer className="mt-20 flex items-end justify-between">
            <p className="max-w-xs text-[11px] text-slate-400">
              Thank you for choosing us. Please keep this invoice for your records. Printed{" "}
              {formatDateTime(new Date())}.
            </p>
            <div className="w-56 border-t border-slate-400 pt-1 text-center text-xs text-slate-500">
              Authorised signature
            </div>
          </footer>
        </>
      )}
    </PrintShell>
  );
}

function Row({ label, value, strong = false, tone = "text-slate-900" }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-slate-300 pt-1 font-semibold" : ""}`}>
      <dt className="text-slate-600">{label}</dt>
      <dd className={tone}>{value}</dd>
    </div>
  );
}
