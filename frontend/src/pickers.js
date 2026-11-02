import { appointmentsApi, medicinesApi, patientsApi } from "./api.js";
import { formatDateTime, fullName } from "./format.js";

// Search functions for SearchPicker. They live at module level so their identity
// never changes, which the picker relies on to know when to search again.

export function patientOption(patient) {
  return {
    value: patient.id,
    label: fullName(patient.user_details, `Patient #${patient.id}`),
    hint: [patient.medical_record_number, patient.phone].filter(Boolean).join(" · "),
  };
}

export async function searchPatients(text) {
  const rows = await patientsApi.list(text ? { search: text } : undefined);
  return rows.map(patientOption);
}

export function doctorLabel(doctor) {
  return `Dr. ${fullName(doctor.user_details, `#${doctor.id}`)}`;
}

export async function searchMedicines(text) {
  const rows = await medicinesApi.list({ is_active: true, ...(text && { search: text }) });
  return rows.map((medicine) => ({
    value: medicine.id,
    label: medicine.name,
    hint: [medicine.generic_name, medicine.unit].filter(Boolean).join(" · "),
  }));
}

export function appointmentOption(appointment) {
  return {
    value: appointment.id,
    label: appointment.patient_name ?? `Patient #${appointment.patient}`,
    hint: `${formatDateTime(appointment.appointment_date)} · ${appointment.doctor_name ?? ""}`,
  };
}

// A visit takes one prescription, and a cancelled visit takes none.
export async function searchPrescribableAppointments(text) {
  const rows = await appointmentsApi.list({ ordering: "-appointment_date", ...(text && { search: text }) });
  return rows
    .filter((appointment) => appointment.status !== "cancelled" && !appointment.has_prescription)
    .map(appointmentOption);
}
