import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, RefreshCw, Users } from "lucide-react";
import { fetchMyQueue } from "../api.js";
import { formatDateTime, formatTime } from "../format.js";
import { usePolling } from "../hooks.js";
import { Alert, Badge, Card, EmptyState, Loading, PageHeader } from "../components/index.js";

const DOCTOR_STATUS = {
  in_clinic: { label: "In clinic", tone: "success" },
  on_break: { label: "On a break", tone: "warning" },
  running_late: { label: "Running late", tone: "warning" },
  unavailable: { label: "Unavailable today", tone: "danger" },
};

function waitLabel(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes === 0) return "You're next";
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `about ${hours}h ${rest}m` : `about ${hours}h`;
}

export default function MyQueue() {
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setQueue(await fetchMyQueue());
      setError("");
      setUpdatedAt(new Date());
    } catch {
      setError("Could not load your queue position.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  usePolling(load, 30000, { immediate: true });

  const appointment = queue?.appointment;
  const status = DOCTOR_STATUS[queue?.doctor_status] ?? { label: "Unknown", tone: "neutral" };

  return (
    <>
      <PageHeader
        eyebrow="Live queue"
        title="Your place in line"
        subtitle={
          <span className="inline-flex items-center gap-2">
            {updatedAt ? `Checked at ${formatTime(updatedAt)} · updates on its own` : "Checking…"}
            <button
              type="button"
              onClick={load}
              disabled={isRefreshing}
              aria-label="Check again now"
              title="Check again now"
              className="rounded-lg p-1 text-brand-700 hover:bg-brand-50 disabled:opacity-60"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
            </button>
          </span>
        }
      />

      <Alert onRetry={load}>{error}</Alert>

      {!queue && !error && <Loading message="Finding your place in line…" />}

      {queue && !appointment && (
        <EmptyState
          mood="calm"
          title="Nothing booked for today"
          message="When you have an appointment today, your position will appear here."
          action={
            <Link
              to="/appointments?book=1"
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Book a visit
            </Link>
          }
        />
      )}

      {appointment && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card tone="tinted" className="animate-rise p-8 lg:col-span-2">
            <p className="text-sm text-white/70">{queue.doctor_name}</p>

            {queue.position ? (
              <>
                <div className="mt-4 flex items-end gap-4">
                  <span
                    className={`flex h-24 w-24 items-center justify-center rounded-3xl bg-white/15 text-5xl font-semibold ${
                      queue.is_next ? "animate-ring" : ""
                    }`}
                  >
                    {queue.position}
                  </span>
                  <div className="pb-2">
                    <p className="text-2xl font-semibold">
                      {queue.is_next ? "You're next" : `${queue.people_ahead} ahead of you`}
                    </p>
                    {!queue.is_next && (
                      <p className="text-sm text-white/70">
                        Estimated wait {waitLabel(queue.estimated_wait_minutes)}
                      </p>
                    )}
                    {queue.is_next && (
                      <p className="text-sm text-white/70">Please stay close to the room.</p>
                    )}
                  </div>
                </div>

                <p className="mt-6 text-xs text-white/60">
                  This is an estimate based on how long this doctor usually takes. It can change.
                </p>
              </>
            ) : (
              <div className="mt-4">
                <p className="text-2xl font-semibold">Not checked in yet</p>
                <p className="mt-1 text-sm text-white/70">
                  Your position appears once reception checks you in at the desk.
                </p>
              </div>
            )}
          </Card>

          <div className="stagger space-y-4">
            <Card className="p-5">
              <div className="mb-2 flex items-center gap-2 text-ink-500">
                <Users size={15} />
                <span className="text-xs font-semibold uppercase tracking-wider">Doctor status</span>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
              {queue.doctor_status_note && (
                <p className="mt-2 text-sm text-ink-500">{queue.doctor_status_note}</p>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-2 flex items-center gap-2 text-ink-500">
                <Clock size={15} />
                <span className="text-xs font-semibold uppercase tracking-wider">Your appointment</span>
              </div>
              <p className="font-medium text-ink-900">
                {formatDateTime(appointment.appointment_date)}
              </p>
              {appointment.reason && (
                <p className="mt-1 text-sm text-ink-500">{appointment.reason}</p>
              )}
              {appointment.consultation_type === "online" && appointment.meeting_link && (
                <a
                  href={appointment.meeting_link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
                >
                  Join the online consultation
                </a>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
