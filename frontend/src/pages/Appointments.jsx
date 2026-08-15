import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { appointmentsApi, doctorsApi, patientsApi } from "../api.js";
import { useFlash } from "../flash.js";
import {
  Alert,
  Button,
  IconButton,
  Input,
  PageHeader,
  Select,
  Table,
} from "../components/index.js";

export default function Appointments() {
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  // Filters
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterPatient, setFilterPatient] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Form State
  const [formIsOpen, setFormIsOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [status, setStatus] = useState("pending");
  const [isSaving, setIsSaving] = useState(false);

  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((c) => c + 1);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const params = {};
        if (filterDoctor) params.doctor = filterDoctor;
        if (filterPatient) params.patient = filterPatient;
        if (filterDate) params.appointment_date = filterDate;

        const [aptRes, docRes, patRes] = await Promise.all([
          appointmentsApi.list(params),
          doctorsApi.list(),
          patientsApi.list(),
        ]);
        setAppointments(aptRes);
        setDoctors(docRes);
        setPatients(patRes);
        setError("");
      } catch (err) {
        setError(err.message || "Failed to load appointments.");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [reloadCount, filterDoctor, filterPatient, filterDate]);

  async function handleCreate(e) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await appointmentsApi.create({
        patient: Number(patientId),
        doctor: Number(doctorId),
        appointment_date: new Date(appointmentDate).toISOString(),
        status,
      });
      setNotice("Appointment booked successfully.");
      setFormIsOpen(false);
      setPatientId("");
      setDoctorId("");
      setAppointmentDate("");
      reload();
    } catch (err) {
      setError(err.message || "Failed to book appointment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus(id, newStatus) {
    try {
      await appointmentsApi.patch(id, { status: newStatus });
      setNotice(`Appointment marked as ${newStatus}.`);
      reload();
    } catch (err) {
      setError(err.message || "Failed to update status.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Manage and filter hospital bookings."
      />

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      {/* Filter Section */}
      <div className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <Select
          label="Filter by Doctor"
          placeholder="All Doctors"
          value={filterDoctor}
          onChange={(e) => setFilterDoctor(e.target.value)}
        >
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.user_details?.first_name} {d.user_details?.last_name} (
              {d.specialization})
            </option>
          ))}
        </Select>

        <Select
          label="Filter by Patient"
          placeholder="All Patients"
          value={filterPatient}
          onChange={(e) => setFilterPatient(e.target.value)}
        >
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.user_details?.first_name} {p.user_details?.last_name}
            </option>
          ))}
        </Select>

        <Input
          label="Filter by Date"
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
      </div>

      {formIsOpen && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Book Appointment
            </h2>
            <IconButton onClick={() => setFormIsOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Patient"
              placeholder="Select Patient"
              required
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.user_details?.first_name} {p.user_details?.last_name}
                </option>
              ))}
            </Select>

            <Select
              label="Doctor"
              placeholder="Select Doctor"
              required
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user_details?.first_name} {d.user_details?.last_name} -{" "}
                  {d.specialization}
                </option>
              ))}
            </Select>

            <Input
              label="Date & Time"
              type="datetime-local"
              required
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
            />

            <Select
              label="Initial Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </Select>
          </div>

          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Book Appointment"}
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
            {isLoading ? "Loading..." : `${appointments.length} Appointments`}
          </h2>
          <Button onClick={() => setFormIsOpen(true)}>
            <Plus size={14} /> Book Appointment
          </Button>
        </div>

        <Table
          columns={["ID", "Patient", "Doctor", "Date", "Status", "Actions"]}
        >
          {appointments.map((apt) => (
            <tr
              key={apt.id}
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              <td className="px-3 py-2 text-slate-700">{apt.id}</td>
              <td className="px-3 py-2 text-slate-700">
                Patient #{apt.patient}
              </td>
              <td className="px-3 py-2 text-slate-700">Doctor #{apt.doctor}</td>
              <td className="px-3 py-2 text-slate-700">
                {new Date(apt.appointment_date).toLocaleString()}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    apt.status === "approved"
                      ? "bg-emerald-100 text-emerald-700"
                      : apt.status === "cancelled"
                        ? "bg-red-100 text-red-700"
                        : apt.status === "completed"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {apt.status}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  {apt.status === "pending" && (
                    <button
                      onClick={() => updateStatus(apt.id, "approved")}
                      className="text-xs font-medium text-emerald-600 hover:underline"
                    >
                      Approve
                    </button>
                  )}
                  {apt.status !== "completed" && apt.status !== "cancelled" && (
                    <>
                      <button
                        onClick={() => updateStatus(apt.id, "completed")}
                        className="text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => updateStatus(apt.id, "cancelled")}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
