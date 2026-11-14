import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, PlayCircle, RefreshCw } from "lucide-react";
import {
  completeAppointment,
  doctorsApi,
  fetchDoctorQueue,
  setClinicStatus,
  startAppointment,
} from "../api.js";
import { useAuth } from "../auth-context.js";
import { apiError } from "../errors.js";
import { formatTime } from "../format.js";
import { usePolling } from "../hooks.js";
import { doctorLabel } from "../pickers.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Loading,
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

const REFRESH_MS = 20000;

function sinceLabel(date, now) {
  if (!date) return "";
  const seconds = Math.max(0, Math.round((now - date) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

export default function Queue() {
  const { user } = useAuth();
  const toast = useToast();
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState("");
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [note, setNote] = useState(null);

  const ownDoctorId = user?.role === "doctor" ? user.doctor_id : null;

  useEffect(() => {
    if (ownDoctorId) return;

    let active = true;
    doctorsApi
      .listAll()
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

  const load = useCallback(async () => {
    if (!activeDoctorId) return;
    setIsRefreshing(true);
    try {
      const data = await fetchDoctorQueue(activeDoctorId);
      setBoard(data);
      setError("");
      setUpdatedAt(Date.now());
    } catch (problem) {
      setError(apiError(problem, "Could not load the queue."));
    } finally {
      setIsRefreshing(false);
    }
  }, [activeDoctorId]);

  usePolling(load, REFRESH_MS, { immediate: true });

  // Ticks the "updated 12s ago" label.
  const tick = useCallback(() => setNow(Date.now()), []);
  usePolling(tick, 5000);

  async function act(action, appointmentId, message) {
    setWorkingId(appointmentId);
    try {
      await action(appointmentId);
      toast.success(message);
      await load();
    } catch (problem) {
      toast.error(apiError(problem, "That action did not work."));
    } finally {
      setWorkingId(null);
    }
  }

  async function changeStatus(value, statusNote = "") {
    try {
      await setClinicStatus(activeDoctorId, value, statusNote);
      toast.success("Clinic status updated. Waiting patients see it straight away.");
      setNote(null);
      load();
    } catch (problem) {
      toast.error(apiError(problem, "Could not update the clinic status."));
    }
  }

  const waiting = board?.waiting ?? [];
  const current = waiting.find((row) => row.status === "in_consultation");
  const rest = waiting.filter((row) => row.status !== "in_consultation");
  const status = board?.clinic_status;

  return (
    <>
      <PageHeader
        eyebrow="Live queue"
        title={board?.doctor ?? "Queue"}
        subtitle={
          <span className="inline-flex items-center gap-2">
            {updatedAt ? `Updated ${sinceLabel(updatedAt, now)} · refreshes on its own` : "Loading…"}
            <button
              type="button"
              onClick={load}
              disabled={isRefreshing}
              aria-label="Refresh now"
              title="Refresh now"
              className="rounded-lg p-1 text-brand-700 hover:bg-brand-50 disabled:opacity-60"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
            </button>
          </span>
        }
        action={
          doctors.length > 0 && (
            <Select
              aria-label="Doctor"
              value={activeDoctorId}
              onChange={(event) => {
                setBoard(null);
                setDoctorId(event.target.value);
              }}
              className="sm:w-64"
            >
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctorLabel(doctor)} · {doctor.specialization}
                </option>
              ))}
            </Select>
          )
        }
      />

      <Alert onRetry={load}>{error}</Alert>

      {!board && !error && <Loading message="Loading the queue…" />}

      {board && (
        <Card className="animate-rise mb-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={TONES[status]}>{STATUSES.find((s) => s.value === status)?.label ?? status}</Badge>
              <span className="text-sm text-ink-500">
                {waiting.length} in the queue · about {board.average_consult_minutes} min each
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Select
                aria-label="Clinic status"
                value={status}
                onChange={(event) => changeStatus(event.target.value)}
                className="w-48"
              >
                {STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              {note === null && (
                <Button size="sm" variant="ghost" onClick={() => setNote(board.status_note ?? "")}>
                  Add a note
                </Button>
              )}
            </div>
          </div>
          {board.status_note && note === null && (
            <p className="mt-3 text-sm text-ink-500">Note to patients: “{board.status_note}”</p>
          )}
          {note !== null && (
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                changeStatus(status, note.trim());
              }}
            >
              <div className="flex-1">
                <Input
                  label="Note shown to waiting patients"
                  placeholder="Back at 2:30 pm"
                  maxLength={120}
                  value={note}
                  autoFocus
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Save note</Button>
                <Button variant="secondary" onClick={() => setNote(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
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
            busy={workingId === current.appointment_id}
            onClick={() => act(completeAppointment, current.appointment_id, `Finished with ${current.patient_name}.`)}
          >
            {workingId !== current.appointment_id && <CheckCircle2 size={16} />} Finish consultation
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
        <ol className="stagger space-y-3">
          {rest.map((row, index) => (
            <Card as="li" key={row.appointment_id} className="lift flex items-center gap-4 p-4">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-semibold ${
                  index === 0 ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700"
                }`}
              >
                {row.position}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900">{row.patient_name}</p>
                <p className="truncate text-sm text-ink-500">
                  {row.reason || "No reason given"} · checked in {formatTime(row.checked_in_at)}
                </p>
              </div>

              <Button
                variant={index === 0 && !current ? "primary" : "ghost"}
                busy={workingId === row.appointment_id}
                disabled={workingId !== null}
                onClick={() => act(startAppointment, row.appointment_id, `Now seeing ${row.patient_name}.`)}
              >
                {workingId !== row.appointment_id && <PlayCircle size={16} />} Start
              </Button>
            </Card>
          ))}
        </ol>
      )}
    </>
  );
}
