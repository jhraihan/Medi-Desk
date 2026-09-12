import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { appointmentsApi, dispensePrescription, medicinesApi, prescriptionsApi } from "../api.js";
import { useAuth } from "../auth-context.js";
import { apiError } from "../errors.js";
import { useFlash } from "../flash.js";
import {
  Alert,
  Button,
  IconButton,
  Input,
  PageHeader,
  Select,
  Table,
  Textarea,
} from "../components/index.js";

export default function Prescriptions() {
  const { user } = useAuth();
  const canDispense = ["pharmacist", "admin"].includes(user?.role);
  const canPrescribe = ["doctor", "admin"].includes(user?.role);
  const [prescriptions, setPrescriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  const [formIsOpen, setFormIsOpen] = useState(false);
  const [appointmentId, setAppointmentId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedMedicines, setSelectedMedicines] = useState([
    { medicine: "", dosage: "", duration: "" },
  ]);
  const [isSaving, setIsSaving] = useState(false);

  const [reloadCount, setReloadCount] = useState(0);

  async function handleDispense(id) {
    try {
      await dispensePrescription(id);
      setNotice("Prescription dispensed and stock updated.");
      setReloadCount((count) => count + 1);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not dispense this prescription.");
    }
  }
  const reload = () => setReloadCount((c) => c + 1);

  useEffect(() => {
    async function load() {
      try {
        setPrescriptions(await prescriptionsApi.list());
        setError("");
      } catch {
        setError("Could not load prescriptions.");
      } finally {
        setIsLoading(false);
      }

      if (!canPrescribe) return;

      const [aptRes, medRes] = await Promise.all([
        appointmentsApi.list().catch(() => []),
        medicinesApi.list().catch(() => []),
      ]);
      setAppointments(aptRes);
      setMedicines(medRes);
    }
    load();
  }, [reloadCount, canPrescribe]);

  function handleAddMedicineRow() {
    setSelectedMedicines([
      ...selectedMedicines,
      { medicine: "", dosage: "", duration: "" },
    ]);
  }

  function handleRemoveMedicineRow(index) {
    setSelectedMedicines(selectedMedicines.filter((_, i) => i !== index));
  }

  function handleMedicineChange(index, field, value) {
    const updated = [...selectedMedicines];
    updated[index][field] = value;
    setSelectedMedicines(updated);
  }

  async function handleSave(e) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload = {
        appointment: Number(appointmentId),
        diagnosis,
        notes,
        medicines: selectedMedicines.map((m) => ({
          medicine: Number(m.medicine),
          dosage: m.dosage,
          duration: m.duration,
        })),
      };

      await prescriptionsApi.create(payload);
      setNotice("Prescription issued successfully.");
      setFormIsOpen(false);
      setAppointmentId("");
      setDiagnosis("");
      setNotes("");
      setSelectedMedicines([{ medicine: "", dosage: "", duration: "" }]);
      reload();
    } catch (err) {
      setError(apiError(err, "Could not create that prescription."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Prescriptions"
        subtitle="Manage prescriptions and link multiple medicines."
      />

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      {formIsOpen && (
        <form
          onSubmit={handleSave}
          className="animate-rise glass-strong mb-5 rounded-2xl p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">
              Issue New Prescription
            </h2>
            <IconButton onClick={() => setFormIsOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Appointment"
              placeholder="Select Appointment..."
              required
              value={appointmentId}
              onChange={(e) => setAppointmentId(e.target.value)}
            >
              {appointments.map((apt) => (
                <option key={apt.id} value={apt.id}>
                  Appointment #{apt.id} (Patient #{apt.patient})
                </option>
              ))}
            </Select>
          </div>

          <Textarea
            label="Diagnosis"
            className="mt-4"
            required
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
          />

          <Textarea
            label="Notes"
            className="mt-4"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="mt-6 rounded-md border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-slate-600">
                Prescribed Medicines
              </h3>
              <Button variant="secondary" onClick={handleAddMedicineRow}>
                <Plus size={14} /> Add Medicine
              </Button>
            </div>

            {selectedMedicines.map((row, index) => (
              <div
                key={index}
                className="mb-3 grid items-end gap-3 sm:grid-cols-4"
              >
                <Select
                  label="Medicine"
                  placeholder="Select Medicine"
                  required
                  value={row.medicine}
                  onChange={(e) =>
                    handleMedicineChange(index, "medicine", e.target.value)
                  }
                >
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unit})
                    </option>
                  ))}
                </Select>

                <Input
                  label="Dosage"
                  placeholder="e.g., 1 tablet twice daily"
                  required
                  value={row.dosage}
                  onChange={(e) =>
                    handleMedicineChange(index, "dosage", e.target.value)
                  }
                />

                <Input
                  label="Duration"
                  placeholder="e.g., 7 days"
                  required
                  value={row.duration}
                  onChange={(e) =>
                    handleMedicineChange(index, "duration", e.target.value)
                  }
                />

                {selectedMedicines.length > 1 && (
                  <div className="pb-1">
                    <IconButton
                      variant="danger"
                      onClick={() => handleRemoveMedicineRow(index)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Prescription"}
            </Button>
            <Button variant="secondary" onClick={() => setFormIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="animate-fade">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink-900">
            {isLoading ? "Loading…" : `${prescriptions.length} prescriptions`}
          </h2>
          {canPrescribe && (
            <Button onClick={() => setFormIsOpen(true)}>
              <Plus size={14} /> Create Prescription
            </Button>
          )}
        </div>

        <Table
          columns={[
            "ID",
            "Appointment",
            "Diagnosis",
            "Notes",
            "Medicines Count",
            "Date",
            "Status",
          ]}
        >
          {prescriptions.map((p) => (
            <tr
              key={p.id}
              className="transition-colors duration-150 hover:bg-white/60"
            >
              <td className="px-4 py-3 text-ink-700">{p.id}</td>
              <td className="px-4 py-3 text-ink-700">
                Appointment #{p.appointment}
              </td>
              <td className="px-4 py-3 text-ink-700">{p.diagnosis}</td>
              <td className="px-4 py-3 text-ink-700">{p.notes || "—"}</td>
              <td className="px-4 py-3 text-ink-700">
                {p.prescription_medicines?.length || 0} item(s)
              </td>
              <td className="px-4 py-3 text-ink-700">
                {new Date(p.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                {p.status === "dispensed" ? (
                  <span className="text-xs font-semibold text-emerald-700">Dispensed</span>
                ) : canDispense ? (
                  <button
                    onClick={() => handleDispense(p.id)}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    Dispense
                  </button>
                ) : (
                  <span className="text-xs capitalize text-slate-500">{p.status ?? "issued"}</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
