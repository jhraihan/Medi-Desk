import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Clock, Pill, Plus, SkipForward, Users, X } from "lucide-react";
import {
  careContactsApi,
  fetchTodayDoses,
  markDose,
  medicationSchedulesApi,
} from "../api.js";
import { apiError } from "../errors.js";
import { formatDate, formatTime, localISODate } from "../format.js";
import { useLoader } from "../hooks.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Loading,
  Modal,
  PageHeader,
  StatTile,
} from "../components/index.js";

const STATE_TONES = {
  pending: "neutral",
  taken: "success",
  missed: "danger",
  skipped: "warning",
};

const loadAll = async () => {
  const [today, schedules, contacts] = await Promise.all([
    fetchTodayDoses(),
    medicationSchedulesApi.listAll(),
    careContactsApi.listAll(),
  ]);
  return { today, schedules, contact: contacts[0] ?? null };
};

export default function Reminders() {
  const toast = useToast();
  const { data, error, isLoading, reload } = useLoader(loadAll, "Could not load your reminders.");

  const [formOpen, setFormOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [stopping, setStopping] = useState(null);
  const [isWorking, setIsWorking] = useState(false);
  const [workingDose, setWorkingDose] = useState(null);

  const today = data?.today;
  const schedules = data?.schedules ?? [];
  const contact = data?.contact;
  const doses = today?.doses ?? [];
  const dueNow = doses.filter((dose) => dose.state === "pending");

  async function confirm(dose, state) {
    setWorkingDose(dose.id);
    try {
      await markDose(dose.id, state);
      toast.success(state === "taken" ? `${dose.medicine_name}: marked as taken.` : `${dose.medicine_name}: skipped.`);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not update that dose."));
    } finally {
      setWorkingDose(null);
    }
  }

  async function confirmStop() {
    setIsWorking(true);
    try {
      await medicationSchedulesApi.patch(stopping.id, { is_active: false });
      toast.success(`Reminders for ${stopping.medicine_name} stopped.`);
      setStopping(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not stop that reminder."));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Medicines"
        title="Your reminders"
        subtitle="Today's doses, and how well you are keeping up."
        action={
          <Button onClick={() => setFormOpen(true)}>
            <Plus size={15} /> Add a medicine
          </Button>
        }
      />

      <Alert onRetry={reload}>{error}</Alert>

      {today && (
        <div className="stagger mb-5 grid gap-4 sm:grid-cols-3">
          <StatTile label="Due today" value={doses.length} icon={Clock} />
          <StatTile label="Still to take" value={dueNow.length} icon={Pill} />
          <StatTile
            label="Adherence"
            value={today.adherence === null ? "—" : `${today.adherence}%`}
            hint={today.total ? `${today.taken} of ${today.total} doses` : "No doses recorded yet"}
            icon={Check}
            tone={today.adherence !== null && today.adherence < 70 ? "tinted" : "glass"}
          />
        </div>
      )}

      {isLoading && !data && <Loading message="Checking today's doses…" />}

      {data && doses.length === 0 && (
        <EmptyState
          mood="happy"
          title="Nothing due today"
          message="Add a medicine and its times, or turn a prescription into reminders from the Prescriptions page."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setFormOpen(true)}>
                <Plus size={15} /> Add a medicine
              </Button>
              <Link
                to="/prescriptions"
                className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                From a prescription
              </Link>
            </div>
          }
        />
      )}

      {doses.length > 0 && (
        <Card className="animate-rise mb-5 p-5">
          <h2 className="mb-4 font-semibold text-ink-900">Today</h2>
          <div className="space-y-2">
            {doses.map((dose) => (
              <div
                key={dose.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${
                  dose.state === "pending" ? "bg-white/70" : "bg-white/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-14 items-center justify-center rounded-xl bg-brand-50 text-xs font-semibold text-brand-700 tabular-nums">
                    {formatTime(dose.due_at)}
                  </span>
                  <div>
                    <p className={`font-medium ${dose.state === "pending" ? "text-ink-900" : "text-ink-500"}`}>
                      {dose.medicine_name}
                    </p>
                    <p className="text-xs text-ink-500">
                      {dose.dosage}
                      {dose.instructions && ` · ${dose.instructions}`}
                    </p>
                  </div>
                </div>

                {dose.state === "pending" ? (
                  <div className="flex gap-2">
                    <Button
                      variant="success"
                      busy={workingDose === dose.id}
                      disabled={workingDose !== null}
                      onClick={() => confirm(dose, "taken")}
                    >
                      {workingDose !== dose.id && <Check size={15} />} Taken
                    </Button>
                    <Button variant="secondary" disabled={workingDose !== null} onClick={() => confirm(dose, "skipped")}>
                      <SkipForward size={15} /> Skip
                    </Button>
                  </div>
                ) : (
                  <Badge tone={STATE_TONES[dose.state]}>{dose.state}</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {schedules.length > 0 && (
        <Card className="animate-rise mb-5 p-5">
          <h2 className="mb-4 font-semibold text-ink-900">Your medicines</h2>
          <div className="space-y-2">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/60 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-ink-900">
                    {schedule.medicine_name}
                    {!schedule.is_active && <span className="ml-2 text-xs font-normal text-ink-500">stopped</span>}
                  </p>
                  <p className="text-xs text-ink-500">
                    {schedule.dosage} · {schedule.times.join(", ")} · until {formatDate(schedule.end_date)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {schedule.adherence !== null && (
                    <Badge tone={schedule.adherence >= 80 ? "success" : "warning"}>{schedule.adherence}% taken</Badge>
                  )}
                  {schedule.is_active && (
                    <Button size="sm" variant="danger-ghost" onClick={() => setStopping(schedule)}>
                      Stop
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data &&
        (contact ? (
          <Card className="animate-rise p-5">
            <div className="flex items-center gap-2 text-ink-500">
              <Users size={15} />
              <span className="text-xs font-semibold uppercase tracking-wider">Family contact</span>
            </div>
            <p className="mt-2 font-medium text-ink-900">
              {contact.name}
              {contact.relationship && ` · ${contact.relationship}`}
            </p>
            <p className="text-sm text-ink-500">
              Told if you miss {contact.alert_after_misses} doses of the same medicine in a week.
            </p>
          </Card>
        ) : (
          <Card className="animate-rise flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-medium text-ink-900">Want someone told if you miss doses?</p>
              <p className="text-sm text-ink-500">Add a family member. Nobody is contacted unless you choose this.</p>
            </div>
            <Button variant="secondary" onClick={() => setContactOpen(true)}>
              Add a contact
            </Button>
          </Card>
        ))}

      {formOpen && (
        <ScheduleModal
          onClose={() => setFormOpen(false)}
          onSaved={(name) => {
            setFormOpen(false);
            toast.success(`Reminders set for ${name}.`);
            reload();
          }}
        />
      )}

      {contactOpen && (
        <ContactModal
          onClose={() => setContactOpen(false)}
          onSaved={() => {
            setContactOpen(false);
            toast.success("Family contact saved.");
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(stopping)}
        title={`Stop reminders for ${stopping?.medicine_name}?`}
        message="No more doses are scheduled for it. Doses already recorded stay in your history."
        confirmLabel="Stop reminders"
        workingLabel="Stopping…"
        isWorking={isWorking}
        onConfirm={confirmStop}
        onCancel={() => setStopping(null)}
      />
    </>
  );
}

function ScheduleModal({ onClose, onSaved }) {
  const [medicineName, setMedicineName] = useState("");
  const [dosage, setDosage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [times, setTimes] = useState(["09:00", "21:00"]);
  const [startDate, setStartDate] = useState(() => localISODate());
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const chosen = [...new Set(times.filter(Boolean))].sort();
    if (chosen.length === 0) return setError("Add at least one time of day.");

    setIsSaving(true);
    setError("");
    try {
      await medicationSchedulesApi.create({
        medicine_name: medicineName.trim(),
        dosage: dosage.trim(),
        instructions: instructions.trim(),
        times: chosen,
        start_date: startDate,
        end_date: endDate,
      });
      onSaved(medicineName.trim());
    } catch (problem) {
      setError(apiError(problem, "Could not add that reminder."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title="Add a medicine"
      subtitle="You'll get a dose to tick off at each time, every day between the two dates."
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
            {isSaving ? "Saving…" : "Add reminder"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Medicine" required placeholder="Metformin" value={medicineName} onChange={(event) => setMedicineName(event.target.value)} />
        <Input label="Dose" required placeholder="1 tablet" value={dosage} onChange={(event) => setDosage(event.target.value)} />
        <div className="sm:col-span-2">
          <Input
            label="Instructions"
            placeholder="After meals"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-sm font-medium text-ink-700">
          Times of day<span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          {times.map((time, index) => (
            <span key={index} className="inline-flex items-center gap-1 rounded-xl bg-brand-50 py-1 pr-1 pl-2 ring-1 ring-brand-100">
              <input
                type="time"
                aria-label={`Time ${index + 1}`}
                value={time}
                onChange={(event) =>
                  setTimes((current) => current.map((value, position) => (position === index ? event.target.value : value)))
                }
                className="bg-transparent text-sm font-medium text-ink-900 outline-none"
              />
              {times.length > 1 && (
                <IconButton
                  label="Remove this time"
                  className="p-1"
                  onClick={() => setTimes((current) => current.filter((_, position) => position !== index))}
                >
                  <X size={13} />
                </IconButton>
              )}
            </span>
          ))}
          {times.length < 6 && (
            <Button size="sm" variant="ghost" onClick={() => setTimes((current) => [...current, "14:00"])}>
              <Plus size={13} /> Add a time
            </Button>
          )}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input label="Start" type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        <Input
          label="Finish"
          type="date"
          required
          min={startDate}
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
      </div>
    </Modal>
  );
}

function ContactModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      await careContactsApi.create({ name, phone, relationship, consent_given: true });
      onSaved();
    } catch (problem) {
      setError(apiError(problem, "Could not save that contact."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Tell a family member if you miss doses"
      subtitle="They're only told if you repeatedly miss the same medicine. You can remove them at any time."
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
            {isSaving ? "Saving…" : "Save contact"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" required value={name} onChange={(event) => setName(event.target.value)} />
        <Input label="Relationship" placeholder="Son" value={relationship} onChange={(event) => setRelationship(event.target.value)} />
        <div className="sm:col-span-2">
          <Input label="Phone" type="tel" required placeholder="01712345678" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
