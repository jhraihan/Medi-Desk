import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarPlus, FilePlus2, UserRound, Video } from "lucide-react";
import { appointmentsApi, checkInAppointment, doctorsApi, fetchAvailableSlots, fetchMe } from "../api.js";
import { apiError } from "../errors.js";
import { useAuth } from "../auth-context.js";
import { canWrite, isStaff } from "../permissions.js";
import { formatDateTime, formatTime, humanize, isToday, localISODate } from "../format.js";
import { useDebounced, useLoader } from "../hooks.js";
import { doctorLabel, searchPatients } from "../pickers.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chips,
  ConfirmDialog,
  Input,
  Modal,
  PageHeader,
  Pager,
  SearchInput,
  SearchPicker,
  Select,
  Table,
  Textarea,
} from "../components/index.js";
import PatientFormModal from "../components/PatientFormModal.jsx";

const STATUS_TONES = {
  pending: "warning",
  approved: "success",
  checked_in: "brand",
  in_consultation: "brand",
  completed: "neutral",
  cancelled: "danger",
};

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "checked_in", label: "Checked in" },
  { value: "in_consultation", label: "With doctor" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// The API lets a booking be cancelled from these states only.
const CANCELLABLE = ["pending", "approved", "checked_in"];
const PRESCRIBABLE = ["checked_in", "in_consultation", "completed"];

const loadDoctors = () => doctorsApi.listAll();

function nextDays(count) {
  return Array.from({ length: count }, (_, offset) => {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    return {
      value: localISODate(day),
      label:
        offset === 0
          ? "Today"
          : offset === 1
            ? "Tomorrow"
            : day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
    };
  });
}

export default function Appointments() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const role = user?.role;
  const mayEdit = canWrite(role, "appointments");
  const mayRunDesk = isStaff(role);
  const needsProfile = role === "patient" && !user?.patient_id;

  // Dashboard shortcuts arrive as ?status=pending, ?when=today, ?book=1&doctor=3.
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(() => params.get("status") ?? "");
  const [day, setDay] = useState(() => (params.get("when") === "today" ? localISODate() : ""));
  const [doctorFilter, setDoctorFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [booking, setBooking] = useState(() =>
    params.get("book") ? { doctor: params.get("doctor") ?? "" } : null,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [workingId, setWorkingId] = useState(null);

  // The booking shortcut has done its job once the dialog is open; drop it from the
  // address so a refresh doesn't open it again.
  useEffect(() => {
    if (params.has("book")) {
      setParams(
        (current) => {
          current.delete("book");
          current.delete("doctor");
          return current;
        },
        { replace: true },
      );
    }
  }, [params, setParams]);

  const settledSearch = useDebounced(search);
  const load = useCallback(() => {
    const query = { page };
    if (status) query.status = status;
    if (day) {
      query.appointment_date__date = day;
      query.ordering = "appointment_date";
    }
    if (doctorFilter) query.doctor = doctorFilter;
    if (settledSearch) query.search = settledSearch;
    return appointmentsApi.listPage(query);
  }, [page, status, day, doctorFilter, settledSearch]);
  const { data, error, isLoading, reload } = useLoader(load, "Could not load appointments.");
  const { data: doctors } = useLoader(loadDoctors);

  const rows = data?.results ?? [];

  function filter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  function openBooking() {
    if (needsProfile) setProfileOpen(true);
    else setBooking({ doctor: "" });
  }

  async function runAction(id, action, message) {
    setWorkingId(id);
    try {
      await action();
      toast.success(message);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "That didn't work. Please try again."));
    } finally {
      setWorkingId(null);
    }
  }

  async function confirmCancel() {
    const appointment = cancelling;
    setWorkingId(appointment.id);
    try {
      await appointmentsApi.patch(appointment.id, { status: "cancelled", cancelled_reason: cancelReason.trim() });
      toast.success("Appointment cancelled.");
      setCancelling(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not cancel this appointment."));
    } finally {
      setWorkingId(null);
    }
  }

  async function profileSaved() {
    setProfileOpen(false);
    toast.success("Profile saved. Now pick a doctor and a time.");
    setUser(await fetchMe());
    setBooking({ doctor: "" });
  }

  const showPatient = role !== "patient";
  const showDoctor = role !== "doctor";
  const columns = [
    showPatient && "Patient",
    showDoctor && "Doctor",
    "When",
    "Status",
    "",
  ].filter((column) => column !== false);

  const filtersActive = Boolean(status || day || doctorFilter || search);

  return (
    <div>
      <PageHeader
        eyebrow="Scheduling"
        title="Appointments"
        subtitle={role === "patient" ? "Your visits, past and upcoming." : "Book, check in and track every visit."}
        action={
          mayEdit && (
            <Button onClick={openBooking}>
              <CalendarPlus size={15} /> {role === "patient" ? "Book a visit" : "Book appointment"}
            </Button>
          )
        }
      />

      {needsProfile && (
        <Card tone="tinted" className="animate-rise mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <UserRound size={20} />
            <p className="text-sm">Complete your patient profile once, then you can book visits here.</p>
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-brand-700"
          >
            Complete my profile
          </button>
        </Card>
      )}

      <Card className="animate-rise mb-4 space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {role !== "patient" && (
            <SearchInput
              label="Search"
              placeholder="Patient, doctor or reason"
              value={search}
              onChange={filter(setSearch)}
              className="lg:col-span-2"
            />
          )}
          {showDoctor && (
            <Select
              label="Doctor"
              placeholder="All doctors"
              value={doctorFilter}
              onChange={(event) => filter(setDoctorFilter)(event.target.value)}
            >
              {(doctors ?? []).map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctorLabel(doctor)} · {doctor.specialization}
                </option>
              ))}
            </Select>
          )}
          <div>
            <Input label="Day" type="date" value={day} onChange={(event) => filter(setDay)(event.target.value)} />
            <div className="mt-1.5 flex gap-3 text-xs font-medium">
              <button type="button" onClick={() => filter(setDay)(localISODate())} className="text-brand-700 hover:underline">
                Today
              </button>
              {day && (
                <button type="button" onClick={() => filter(setDay)("")} className="text-ink-500 hover:underline">
                  Any day
                </button>
              )}
            </div>
          </div>
        </div>
        <Chips label="Status" options={STATUS_FILTERS} value={status} onChange={filter(setStatus)} />
      </Card>

      <Alert onRetry={reload}>{error}</Alert>

      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-ink-500">
        <span aria-live="polite">
          {isLoading && !data ? "Loading…" : `${data?.count ?? 0} appointment${data?.count === 1 ? "" : "s"}`}
        </span>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setStatus("");
              setDay("");
              setDoctorFilter("");
              setSearch("");
              setPage(1);
            }}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <Table
        columns={columns}
        isLoading={isLoading}
        empty={
          filtersActive
            ? "No appointments match these filters."
            : role === "patient"
              ? "You have no appointments yet. Use “Book a visit” to make one."
              : "No appointments yet."
        }
      >
        {rows.map((apt) => {
          const today = isToday(apt.appointment_date);
          const busy = workingId === apt.id;
          const canApprove = mayRunDesk && apt.status === "pending";
          const canCheckIn = mayRunDesk && ["pending", "approved"].includes(apt.status);
          const canCancel = mayEdit && CANCELLABLE.includes(apt.status);
          const canPrescribe =
            ["doctor", "admin"].includes(role) && PRESCRIBABLE.includes(apt.status) && !apt.has_prescription;

          return (
            <tr key={apt.id} className="transition-colors duration-150 hover:bg-white/60">
              {showPatient && (
                <td className="px-4 py-3">
                  <p className="font-medium text-ink-900">{apt.patient_name ?? `Patient #${apt.patient}`}</p>
                  {apt.reason && <p className="max-w-56 truncate text-xs text-ink-500">{apt.reason}</p>}
                </td>
              )}
              {showDoctor && (
                <td className="px-4 py-3 text-ink-700">
                  {apt.doctor_name ?? `Doctor #${apt.doctor}`}
                  {!showPatient && apt.reason && (
                    <p className="max-w-56 truncate text-xs text-ink-500">{apt.reason}</p>
                  )}
                </td>
              )}
              <td className="px-4 py-3 whitespace-nowrap text-ink-700">
                <span className={today ? "font-semibold text-brand-700" : ""}>
                  {formatDateTime(apt.appointment_date)}
                </span>
                {apt.consultation_type === "online" && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-brand-700">
                    <Video size={12} /> Online
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONES[apt.status]}>{humanize(apt.status)}</Badge>
                {apt.status === "cancelled" && apt.cancelled_reason && (
                  <p className="mt-1 max-w-48 truncate text-xs text-ink-500" title={apt.cancelled_reason}>
                    {apt.cancelled_reason}
                  </p>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-end gap-1.5">
                  {canApprove && (
                    <Button
                      size="sm"
                      variant="success"
                      disabled={busy}
                      onClick={() =>
                        runAction(apt.id, () => appointmentsApi.patch(apt.id, { status: "approved" }), "Appointment approved.")
                      }
                    >
                      Approve
                    </Button>
                  )}
                  {canCheckIn && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || !today}
                      title={today ? "Add the patient to today's queue" : "Check-in opens on the day of the visit"}
                      onClick={() =>
                        runAction(apt.id, () => checkInAppointment(apt.id), "Checked in and added to the queue.")
                      }
                    >
                      Check in
                    </Button>
                  )}
                  {canPrescribe && (
                    <Link
                      to={`/prescriptions?new=1&appointment=${apt.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <FilePlus2 size={13} /> Prescribe
                    </Link>
                  )}
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      disabled={busy}
                      onClick={() => {
                        setCancelReason("");
                        setCancelling(apt);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      <Pager page={page} count={data?.count ?? 0} onChange={setPage} />

      {booking && (
        <BookingModal
          doctors={doctors ?? []}
          initialDoctor={booking.doctor}
          onClose={() => setBooking(null)}
          onBooked={(message) => {
            setBooking(null);
            toast.success(message);
            reload();
          }}
        />
      )}

      {profileOpen && (
        <PatientFormModal open self onClose={() => setProfileOpen(false)} onSaved={profileSaved} />
      )}

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancel this appointment?"
        message={
          cancelling &&
          `${cancelling.patient_name ?? "The patient"} with ${cancelling.doctor_name ?? "the doctor"}, ${formatDateTime(
            cancelling.appointment_date,
          )}. The slot is freed for someone else.`
        }
        confirmLabel="Cancel appointment"
        workingLabel="Cancelling…"
        isWorking={workingId === cancelling?.id}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(null)}
      >
        <div className="mt-4">
          <Textarea
            label="Reason (optional)"
            rows={2}
            placeholder="Feeling better, can't make it…"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function BookingModal({ doctors, initialDoctor, onClose, onBooked }) {
  const { user } = useAuth();
  const role = user?.role;
  const forSelf = role === "patient";
  const ownDoctor = role === "doctor" && user?.doctor_id ? String(user.doctor_id) : "";

  const [patient, setPatient] = useState(null);
  const [doctorId, setDoctorId] = useState(ownDoctor || String(initialDoctor || ""));
  const [day, setDay] = useState(localISODate());
  const [slots, setSlots] = useState(null);
  const [slotError, setSlotError] = useState("");
  const [slot, setSlot] = useState("");
  const [manual, setManual] = useState(false);
  const [manualTime, setManualTime] = useState("");
  const [reason, setReason] = useState("");
  const [consultationType, setConsultationType] = useState("in_person");
  const [status, setStatus] = useState("approved");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const bookable = doctors.filter((doctor) => doctor.is_available || String(doctor.id) === ownDoctor);
  const days = nextDays(7);

  useEffect(() => {
    if (!doctorId || !day) return;
    let active = true;

    async function run() {
      setSlots(null);
      setSlot("");
      setSlotError("");
      try {
        const answer = await fetchAvailableSlots(doctorId, day);
        if (active) setSlots(answer.slots ?? []);
      } catch (problem) {
        if (active) {
          setSlots([]);
          setSlotError(apiError(problem, "Could not load the open times."));
        }
      }
    }

    run();
    return () => {
      active = false;
    };
  }, [doctorId, day]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const when = manual ? (manualTime ? new Date(`${day}T${manualTime}`).toISOString() : "") : slot;
    if (!forSelf && !patient) return setError("Choose the patient this visit is for.");
    if (!doctorId) return setError("Choose a doctor.");
    if (!when) return setError("Pick a time for the visit.");

    const payload = {
      doctor: Number(doctorId),
      appointment_date: when,
      reason: reason.trim(),
      consultation_type: consultationType,
    };
    if (!forSelf) {
      payload.patient = patient.value;
      payload.status = status;
    }

    setIsSaving(true);
    try {
      await appointmentsApi.create(payload);
      onBooked(
        forSelf
          ? `Requested for ${formatDateTime(when)}. You'll see it approved here.`
          : `Booked for ${formatDateTime(when)}.`,
      );
    } catch (problem) {
      setError(apiError(problem, "Could not book that appointment."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={forSelf ? "Book a visit" : "Book an appointment"}
      subtitle="Pick a doctor, a day, then one of the open times."
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
            {isSaving ? "Booking…" : forSelf ? "Request visit" : "Book appointment"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!forSelf && (
          <SearchPicker
            label="Patient"
            required
            placeholder="Type a name or phone number…"
            value={patient}
            onChange={setPatient}
            search={searchPatients}
          />
        )}

        <Select
          label="Doctor"
          required
          placeholder={bookable.length ? "Choose a doctor" : "No doctors are taking bookings"}
          disabled={Boolean(ownDoctor)}
          value={doctorId}
          onChange={(event) => setDoctorId(event.target.value)}
        >
          {bookable.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctorLabel(doctor)} · {doctor.specialization}
            </option>
          ))}
        </Select>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-700">Day</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {days.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={day === option.value}
                onClick={() => setDay(option.value)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                  day === option.value
                    ? "bg-brand-600 text-white"
                    : "bg-white text-ink-700 ring-1 ring-brand-100 hover:bg-brand-50"
                }`}
              >
                {option.label}
              </button>
            ))}
            <input
              type="date"
              aria-label="Another day"
              min={localISODate()}
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="rounded-xl border border-brand-200/70 bg-white px-3 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-500"
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-700">
            Time<span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>
          </legend>
          {!doctorId ? (
            <p className="rounded-xl bg-brand-50/60 px-3 py-2.5 text-sm text-ink-500">Choose a doctor to see open times.</p>
          ) : manual ? (
            <Input type="time" aria-label="Time" value={manualTime} onChange={(event) => setManualTime(event.target.value)} />
          ) : slots === null ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Loading open times">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <span key={index} className="h-8 w-16 animate-pulse rounded-xl bg-brand-100/70" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              {slotError || "No open times on this day. Try another day."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={slot === value}
                  onClick={() => setSlot(value)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                    slot === value
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-white text-ink-700 ring-1 ring-brand-100 hover:bg-brand-50"
                  }`}
                >
                  {formatTime(value)}
                </button>
              ))}
            </div>
          )}
          {!forSelf && doctorId && (
            <button
              type="button"
              onClick={() => setManual((value) => !value)}
              className="mt-2 text-xs font-medium text-brand-700 hover:underline"
            >
              {manual ? "Choose from open times instead" : "Enter a time by hand (walk-ins, extra sessions)"}
            </button>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Reason for the visit"
            placeholder="Fever for three days"
            maxLength={255}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Select label="Type" value={consultationType} onChange={(event) => setConsultationType(event.target.value)}>
            <option value="in_person">In person</option>
            <option value="online">Online</option>
          </Select>
          {!forSelf && (
            <Select
              label="Status"
              hint="Approved bookings count as confirmed."
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
            </Select>
          )}
        </div>
      </div>
    </Modal>
  );
}
