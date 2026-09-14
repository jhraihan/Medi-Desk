import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { appointmentsApi, checkInAppointment, doctorsApi, patientsApi } from "../api.js";
import { apiError } from "../errors.js";
import { useAuth } from "../auth-context.js";
import { canWrite, isStaff } from "../permissions.js";
import { useFlash } from "../flash.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  PageHeader,
  Select,
  Table,
} from "../components/index.js";

const STATUS_TONES = {
  pending: "warning",
  approved: "success",
  checked_in: "brand",
  in_consultation: "brand",
  completed: "neutral",
  cancelled: "danger",
};


export default function Appointments() {
  const { user } = useAuth();
  const mayEdit = canWrite(user?.role, "appointments");
  const mayRunDesk = isStaff(user?.role);

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
        setError(apiError(err, "Could not load appointments."));
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
      setError(apiError(err, "Could not book that appointment."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCheckIn(id) {
    try {
      await checkInAppointment(id);
      setNotice("Patient checked in and added to the queue.");
      reload();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not check this patient in.");
    }
  }

  async function updateStatus(id, newStatus) {
    try {
      await appointmentsApi.patch(id, { status: newStatus });
      setNotice(`Appointment marked as ${newStatus}.`);
      reload();
    } catch (err) {
      setError(apiError(err, "Could not update the status."));
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Scheduling"
        title="Appointments"
        subtitle="Book, check in and track every visit."
        action={
          mayEdit && (
            <Button onClick={() => setFormIsOpen(true)}>
              <Plus size={15} /> Book appointment
            </Button>
          )
        }
      />

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      {/* Filter Section */}
      <Card className="animate-rise mb-5 grid gap-3 p-5 sm:grid-cols-3">
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
      </Card>

      {formIsOpen && (
        <Card as="form" tone="strong" onSubmit={handleCreate} className="animate-rise mb-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Book an appointment</h2>
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
        </Card>
      )}

      <p className="mb-3 text-sm text-ink-500">
        {isLoading ? "Loading…" : `${appointments.length} appointments`}
      </p>

      <div className="animate-fade">
        <Table
          columns={["Patient", "Doctor", "Date", "Status", "Actions"]}
        >
          {appointments.map((apt) => (
            <tr key={apt.id} className="transition-colors duration-150 hover:bg-white/60">
              <td className="px-4 py-3 font-medium text-ink-900">
                {apt.patient_name ?? `Patient #${apt.patient}`}
              </td>
              <td className="px-4 py-3 text-ink-700">
                {apt.doctor_name ?? `Doctor #${apt.doctor}`}
              </td>
              <td className="px-4 py-3 text-ink-700">
                {new Date(apt.appointment_date).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONES[apt.status] ?? "neutral"}>
                  {apt.status.replaceAll("_", " ")}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-3">
                  {mayRunDesk && apt.status === "pending" && (
                    <button
                      onClick={() => updateStatus(apt.id, "approved")}
                      className="text-xs font-medium text-emerald-700 hover:underline"
                    >
                      Approve
                    </button>
                  )}
                  {mayRunDesk && ["pending", "approved"].includes(apt.status) && (
                    <button
                      onClick={() => handleCheckIn(apt.id)}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      Check in
                    </button>
                  )}
                  {mayEdit && !["completed", "cancelled"].includes(apt.status) && (
                    <button
                      onClick={() => updateStatus(apt.id, "cancelled")}
                      className="text-xs font-medium text-rose-600 hover:underline"
                    >
                      Cancel
                    </button>
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
