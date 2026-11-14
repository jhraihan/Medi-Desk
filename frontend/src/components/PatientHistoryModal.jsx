import { useEffect, useState } from "react";
import { AlertTriangle, FileText, FlaskConical, Pill, Printer } from "lucide-react";
import { fetchPatientHistory, openPrintable } from "../api.js";
import { apiError } from "../errors.js";
import { formatDate, formatDateTime, humanize } from "../format.js";
import Alert from "./Alert.jsx";
import Badge from "./Badge.jsx";
import Button from "./Button.jsx";
import Loading from "./Loading.jsx";
import Modal from "./Modal.jsx";

const VISIT_TONES = { completed: "success", cancelled: "neutral", in_consultation: "brand", checked_in: "warning" };

/**
 * A patient's chart for the doctor: allergies and conditions first, then every past
 * visit with its diagnosis, medicines and test results, newest first. Opened from the
 * queue, the patient list and the prescription form. Admins and treating doctors only.
 */
export default function PatientHistoryModal({ patientId, onClose, action }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchPatientHistory(patientId)
      .then((history) => active && setData(history))
      .catch((problem) => active && setError(apiError(problem, "Could not load this patient's history.")));
    return () => {
      active = false;
    };
  }, [patientId]);

  const patient = data?.patient;
  const visits = data?.visits ?? [];
  const facts = patient && [
    patient.age != null && `${patient.age} y`,
    patient.gender,
    patient.blood_group && `Blood ${patient.blood_group}`,
    patient.medical_record_number,
  ].filter(Boolean);

  return (
    <Modal
      open
      size="xl"
      title={patient ? patient.name : "Patient history"}
      subtitle={facts?.join(" · ")}
      onClose={onClose}
      footer={
        <>
          {action}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <Alert>{error}</Alert>
      {!data && !error && <Loading message="Opening the chart…" />}

      {patient && (patient.allergies || patient.chronic_conditions) && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {patient.allergies && (
            <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                <strong>Allergies:</strong> {patient.allergies}
              </span>
            </p>
          )}
          {patient.chronic_conditions && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>Long-term conditions:</strong> {patient.chronic_conditions}
            </p>
          )}
        </div>
      )}

      {data && visits.length === 0 && <p className="py-6 text-center text-sm text-ink-500">No visits on record yet.</p>}

      <ol className="space-y-3">
        {visits.map((visit) => (
          <li key={visit.appointment_id} className="rounded-2xl border border-brand-100 bg-white/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink-900">{formatDateTime(visit.date)}</p>
                <p className="text-xs text-ink-500">
                  {visit.doctor} · {visit.doctor_specialization}
                  {visit.reason && ` · ${visit.reason}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={VISIT_TONES[visit.status] ?? "neutral"}>{humanize(visit.status)}</Badge>
                {visit.prescription && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openPrintable(`/print/prescription/${visit.prescription.id}`)}
                  >
                    <Printer size={13} /> Prescription
                  </Button>
                )}
              </div>
            </div>

            {visit.prescription && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-ink-500 uppercase">
                    <FileText size={12} /> Diagnosis
                  </p>
                  <p className="mt-1 text-sm text-ink-900">{visit.prescription.diagnosis}</p>
                  {visit.prescription.notes && (
                    <p className="mt-1 text-xs whitespace-pre-line text-ink-500">{visit.prescription.notes}</p>
                  )}
                  {visit.prescription.follow_up_date && (
                    <p className="mt-1 text-xs text-ink-500">Follow-up {formatDate(visit.prescription.follow_up_date)}</p>
                  )}
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-ink-500 uppercase">
                    <Pill size={12} /> Medicines
                  </p>
                  {visit.prescription.medicines.length === 0 ? (
                    <p className="mt-1 text-sm text-ink-500">None</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5 text-sm text-ink-900">
                      {visit.prescription.medicines.map((medicine, index) => (
                        <li key={index}>
                          <span className="font-medium">{medicine.name}</span>{" "}
                          <span className="text-ink-500">
                            {[medicine.dosage, medicine.frequency, medicine.duration].filter(Boolean).join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {visit.tests.length > 0 && (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-ink-500 uppercase">
                  <FlaskConical size={12} /> Tests
                </p>
                <ul className="mt-1 space-y-1 text-sm">
                  {visit.tests.map((test) => (
                    <li key={test.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-ink-900">{test.name}</span>
                      {test.status === "completed" ? (
                        <>
                          <span className="text-ink-700">{test.result}</span>
                          {test.result_flag === "abnormal" && <Badge tone="danger">abnormal</Badge>}
                        </>
                      ) : (
                        <Badge tone={test.status === "cancelled" ? "neutral" : "warning"}>
                          {test.status === "ordered" ? "awaiting result" : test.status}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
