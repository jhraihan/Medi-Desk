import { useState } from "react";
import { patientsApi } from "../api.js";
import { BLOOD_GROUPS } from "../constants.js";
import { apiError } from "../errors.js";
import { localISODate } from "../format.js";
import Button from "./Button.jsx";
import Input from "./Input.jsx";
import Modal from "./Modal.jsx";
import Select from "./Select.jsx";
import Textarea from "./Textarea.jsx";

const BLANK = {
  first_name: "",
  last_name: "",
  email: "",
  date_of_birth: "",
  gender: "",
  blood_group: "",
  phone: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  allergies: "",
  chronic_conditions: "",
};

function fromPatient(patient) {
  if (!patient) return BLANK;
  const filled = { ...BLANK };
  for (const key of Object.keys(BLANK)) {
    filled[key] = patient[key] ?? patient.user_details?.[key] ?? "";
  }
  return filled;
}

// Three uses: the front desk registering a walk-in (asks for name and email, which
// the API turns into a sign-in account), editing an existing patient, and a patient
// who signed up themselves filling in their own profile (`self`, no account fields).
export default function PatientFormModal({ open, patient, self = false, onClose, onSaved }) {
  // Fresh fields each time the dialog opens; the parent remounts it via `key`.
  const [form, setForm] = useState(() => fromPatient(patient));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const editing = Boolean(patient?.id);
  const asksForAccount = !self;

  function field(name) {
    return {
      value: form[name],
      onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const payload = { ...form, date_of_birth: form.date_of_birth || null };
      if (!asksForAccount) {
        delete payload.first_name;
        delete payload.last_name;
        delete payload.email;
      }
      const saved = editing
        ? await patientsApi.patch(patient.id, payload)
        : await patientsApi.create(payload);
      onSaved?.(saved);
    } catch (problem) {
      setError(apiError(problem, "Could not save these details."));
    } finally {
      setIsSaving(false);
    }
  }

  const title = self
    ? "Complete your patient profile"
    : editing
      ? `Edit ${[form.first_name, form.last_name].filter(Boolean).join(" ") || "patient"}`
      : "Register a patient";

  return (
    <Modal
      open={open}
      size="lg"
      title={title}
      subtitle={
        self
          ? "The clinic needs these details before you can book a visit."
          : "Fields marked * are required."
      }
      error={error}
      busy={isSaving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" busy={isSaving}>
            {isSaving ? "Saving…" : editing ? "Save changes" : self ? "Save my profile" : "Register patient"}
          </Button>
        </>
      }
    >
      {asksForAccount && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <Input label="First name" required autoComplete="off" {...field("first_name")} />
          <Input label="Last name" autoComplete="off" {...field("last_name")} />
          <Input label="Email" type="email" autoComplete="off" {...field("email")} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select label="Gender" required placeholder="Select…" {...field("gender")}>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </Select>
        <Input label="Date of birth" type="date" max={localISODate()} {...field("date_of_birth")} />
        <Select label="Blood group" placeholder="Not known" {...field("blood_group")}>
          {BLOOD_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </Select>
        <Input label="Phone" type="tel" required placeholder="01712345678" {...field("phone")} />
      </div>

      <div className="mt-4">
        <Textarea label="Address" rows={2} required {...field("address")} />
      </div>

      <details className="group mt-4 rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3" open={editing}>
        <summary className="cursor-pointer text-sm font-medium text-brand-700 select-none">
          Emergency contact and medical notes (optional)
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="Emergency contact name" {...field("emergency_contact_name")} />
          <Input label="Emergency contact phone" type="tel" {...field("emergency_contact_phone")} />
          <Textarea label="Allergies" rows={2} placeholder="Penicillin, peanuts…" {...field("allergies")} />
          <Textarea label="Long-term conditions" rows={2} placeholder="Diabetes, asthma…" {...field("chronic_conditions")} />
        </div>
      </details>
    </Modal>
  );
}
