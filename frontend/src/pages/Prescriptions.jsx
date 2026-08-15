import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { appointmentsApi, medicinesApi, prescriptionsApi } from "../api.js";
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
  const reload = () => setReloadCount((c) => c + 1);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const [prescRes, aptRes, medRes] = await Promise.all([
          prescriptionsApi.list(),
          appointmentsApi.list(),
          medicinesApi.list(),
        ]);
        setPrescriptions(prescRes);
        setAppointments(aptRes);
        setMedicines(medRes);
        setError("");
      } catch (err) {
        setError(err.message || "Failed to load prescriptions.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [reloadCount]);

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
      setError(err.message || "Failed to create prescription.");
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
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
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

          {/* Dynamic Medicines Section */}
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

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            {isLoading ? "Loading..." : `${prescriptions.length} Prescriptions`}
          </h2>
          <Button onClick={() => setFormIsOpen(true)}>
            <Plus size={14} /> Create Prescription
          </Button>
        </div>

        <Table
          columns={[
            "ID",
            "Appointment",
            "Diagnosis",
            "Notes",
            "Medicines Count",
            "Date",
          ]}
        >
          {prescriptions.map((p) => (
            <tr
              key={p.id}
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              <td className="px-3 py-2 text-slate-700">{p.id}</td>
              <td className="px-3 py-2 text-slate-700">
                Appointment #{p.appointment}
              </td>
              <td className="px-3 py-2 text-slate-700">{p.diagnosis}</td>
              <td className="px-3 py-2 text-slate-700">{p.notes || "—"}</td>
              <td className="px-3 py-2 text-slate-700">
                {p.prescription_medicines?.length || 0} item(s)
              </td>
              <td className="px-3 py-2 text-slate-700">
                {new Date(p.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
