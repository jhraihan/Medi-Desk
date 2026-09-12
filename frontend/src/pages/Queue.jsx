import { useCallback, useEffect, useState } from "react";
import { PlayCircle, CheckCircle2 } from "lucide-react";
import {
  completeAppointment,
  doctorsApi,
  fetchDoctorQueue,
  setClinicStatus,
  startAppointment,
} from "../api.js";
import { useAuth } from "../auth-context.js";
import { useFlash } from "../flash.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
} from "../components/index.js";

const STATUSES = [
  { value: "in_clinic", label: "In clinic" },
  { value: "on_break", label: "On a break" },
  { value: "running_late", label: "Running late" },
  { value: "unavailable", label: "Unavailable today" },
];

const TONES = {
  in_clinic: "success",
  on_break: "warning",
  running_late: "warning",
  unavailable: "danger",
};

export default function Queue() {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState("");
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  const ownDoctorId = user?.role === "doctor" ? user.doctor_id : null;

  useEffect(() => {
    if (ownDoctorId) return;

    let active = true;
    doctorsApi
      .list()
      .then((rows) => {
        if (!active) return;
        setDoctors(rows);
        setDoctorId((current) => current || (rows[0] ? String(rows[0].id) : ""));
      })
      .catch(() => active && setError("Could not load the doctor list."));

    return () => {
      active = false;
    };
  }, [ownDoctorId]);

  const activeDoctorId = ownDoctorId ? String(ownDoctorId) : doctorId;

  const load = useCallback(() => {
    if (!activeDoctorId) return;
    fetchDoctorQueue(activeDoctorId)
      .then(setBoard)
      .catch(() => setError("Could not load the queue."));
  }, [activeDoctorId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  async function act(action, id, message) {
    try {
      await action(id);
      setNotice(message);
      load();
    } catch (problem) {
      setError(problem.response?.data?.detail || "That action did not work.");
    }
  }

  async function changeStatus(value) {
    try {
      await setClinicStatus(activeDoctorId, value);
      setNotice("Clinic status updated.");
      load();
    } catch {
      setError("Could not update your status.");
    }
  }

  const waiting = board?.waiting ?? [];
  const current = waiting.find((row) => row.status === "in_consultation");
  const rest = waiting.filter((row) => row.status !== "in_consultation");

  return (
    <>
      <PageHeader
        eyebrow="Live queue"
        title={board?.doctor ?? "Queue"}
        subtitle="Refreshes automatically every 20 seconds."
        action={
          doctors.length > 0 && (
            <Select
              value={activeDoctorId}
              onChange={(event) => setDoctorId(event.target.value)}
              className="w-56"
            >
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.user_details?.first_name
                    ? `Dr. ${doctor.user_details.first_name} ${doctor.user_details.last_name}`
                    : doctor.specialization}
                </option>
              ))}
            </Select>
          )
        }
      />

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      {board && (
        <Card className="animate-rise mb-4 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <Badge tone={TONES[board.clinic_status]}>
              {STATUSES.find((s) => s.value === board.clinic_status)?.label ?? board.clinic_status}
            </Badge>
            <span className="text-sm text-ink-500">
              {waiting.length} waiting · about {board.average_consult_minutes} min each
            </span>
          </div>

          <Select
            value={board.clinic_status}
            onChange={(event) => changeStatus(event.target.value)}
            className="w-52"
          >
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </Card>
      )}

      {current && (
        <Card tone="tinted" className="animate-rise mb-4 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/60">Now seeing</p>
            <p className="mt-1 text-2xl font-semibold">{current.patient_name}</p>
            {current.reason && <p className="text-sm text-white/70">{current.reason}</p>}
          </div>
          <Button
            variant="secondary"
            onClick={() => act(completeAppointment, current.appointment_id, "Consultation completed.")}
          >
            <CheckCircle2 size={16} /> Finish
          </Button>
        </Card>
      )}

      {board && rest.length === 0 && !current && (
        <EmptyState
          mood="calm"
          title="Nobody is waiting"
          message="Patients appear here as soon as reception checks them in."
        />
      )}

      {rest.length > 0 && (
        <div className="stagger space-y-3">
          {rest.map((row) => (
            <Card key={row.appointment_id} className="lift flex items-center gap-4 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-semibold text-brand-700">
                {row.position}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900">{row.patient_name}</p>
                <p className="truncate text-sm text-ink-500">
                  {row.reason || "No reason given"} · checked in{" "}
                  {new Date(row.checked_in_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <Button
                variant="ghost"
                onClick={() => act(startAppointment, row.appointment_id, "Consultation started.")}
              >
                <PlayCircle size={16} /> Start
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
