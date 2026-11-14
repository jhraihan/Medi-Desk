import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { prescriptionsApi } from "../../api.js";
import { formatDate, formatDateTime } from "../../format.js";
import { useLoader } from "../../hooks.js";
import PrintShell, { Field } from "../../components/PrintShell.jsx";

export default function PrintPrescription() {
  const { id } = useParams();
  const load = useCallback(() => prescriptionsApi.get(id), [id]);
  const { data: rx, error } = useLoader(load, "Could not load this prescription.");

  const medicines = rx?.prescription_medicines ?? [];
  const tests = (rx?.test_orders ?? []).filter((order) => order.status !== "cancelled");

  return (
    <PrintShell
      title="Prescription"
      ready={Boolean(rx)}
      error={error}
      pdf={rx && { path: `prescriptions/${rx.id}/pdf/`, filename: `prescription-RX${String(rx.id).padStart(6, "0")}.pdf` }}
      meta={
        rx && (
          <div className="text-xs text-slate-600">
            <p>Rx no. {String(rx.id).padStart(6, "0")}</p>
            <p>{formatDate(rx.created_at)}</p>
          </div>
        )
      }
    >
      {rx && (
        <>
          <section className="mt-5 grid grid-cols-2 gap-6 rounded-lg bg-slate-50 p-4 print:bg-white print:p-0">
            <div>
              <p className="text-base font-semibold text-slate-900">{rx.doctor_name}</p>
              {rx.doctor_designation && <p className="font-semibold text-slate-800">{rx.doctor_designation}</p>}
              {rx.doctor_qualification && <p>{rx.doctor_qualification}</p>}
              <p className="text-slate-600">
                {[rx.doctor_specialization, rx.doctor_department].filter(Boolean).join(" · ")}
              </p>
              {rx.doctor_license && <p className="text-xs text-slate-500">Reg. no. {rx.doctor_license}</p>}
            </div>
            <div className="space-y-0.5">
              <Field label="Patient">{rx.patient_name}</Field>
              <Field label="Age / Sex">
                {[rx.patient_age != null && `${rx.patient_age} y`, rx.patient_gender].filter(Boolean).join(" / ")}
              </Field>
              <Field label="MRN">{rx.patient_mrn}</Field>
              <Field label="Blood group">{rx.patient_blood_group}</Field>
              <Field label="Visit">{rx.appointment_date && formatDateTime(rx.appointment_date)}</Field>
            </div>
          </section>

          {rx.patient_allergies && (
            <p className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-rose-800">
              <span className="font-semibold">Allergies: </span>
              {rx.patient_allergies}
            </p>
          )}

          <div className="mt-6 grid grid-cols-[1fr_2fr] gap-8">
            <aside className="space-y-5 border-r border-slate-200 pr-6">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Diagnosis</h2>
                <p className="mt-1 whitespace-pre-line text-slate-900">{rx.diagnosis}</p>
              </div>

              {tests.length > 0 && (
                <div className="print-avoid-break">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Investigations</h2>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {tests.map((test) => (
                      <li key={test.id}>
                        {test.test_name}
                        {test.instructions && <span className="text-slate-500"> — {test.instructions}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {rx.notes && (
                <div className="print-avoid-break">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Advice</h2>
                  <p className="mt-1 whitespace-pre-line">{rx.notes}</p>
                </div>
              )}

              {rx.follow_up_date && (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Follow-up</h2>
                  <p className="mt-1 font-medium text-teal-800">{formatDate(rx.follow_up_date)}</p>
                </div>
              )}
            </aside>

            <section>
              <p className="font-serif text-4xl leading-none text-teal-800">℞</p>
              {medicines.length === 0 ? (
                <p className="mt-4 text-slate-500">No medicines prescribed.</p>
              ) : (
                <ol className="mt-3 space-y-4">
                  {medicines.map((item, index) => (
                    <li key={index} className="print-avoid-break">
                      <p className="font-semibold text-slate-900">
                        {index + 1}. {item.medicine_name}
                        {item.generic_name && (
                          <span className="font-normal text-slate-500"> ({item.generic_name})</span>
                        )}
                      </p>
                      <p className="pl-4">
                        {[item.dosage, item.frequency, item.duration && `for ${item.duration}`]
                          .filter(Boolean)
                          .join(" — ")}
                      </p>
                      <p className="pl-4 text-xs text-slate-500">
                        {[item.instructions, `Qty ${item.quantity} ${item.medicine_unit ?? ""}`.trim()]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <footer className="mt-20 flex items-end justify-between">
            <p className="text-[11px] text-slate-400">Printed {formatDateTime(new Date())} · MediDesk</p>
            <div className="w-56 border-t border-slate-400 pt-1 text-center">
              <p className="font-medium text-slate-900">{rx.doctor_name}</p>
              {rx.doctor_designation && <p className="text-xs text-slate-600">{rx.doctor_designation}</p>}
              <p className="text-xs text-slate-500">Signature</p>
            </div>
          </footer>
        </>
      )}
    </PrintShell>
  );
}
