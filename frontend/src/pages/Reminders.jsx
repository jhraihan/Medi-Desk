import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Pill, Plus, SkipForward, Users, X } from "lucide-react";
import {
  careContactsApi,
  fetchTodayDoses,
  markDose,
  medicationSchedulesApi,
} from "../api.js";
import { useFlash } from "../flash.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Loading,
  IconButton,
  Input,
  PageHeader,
  StatTile,
} from "../components/index.js";

const STATE_TONES = {
  pending: "neutral",
  taken: "success",
  missed: "danger",
  skipped: "warning",
};

function clockLabel(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Reminders() {
  const [today, setToday] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [contact, setContact] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  const [formOpen, setFormOpen] = useState(false);
  const [medicineName, setMedicineName] = useState("");
  const [dosage, setDosage] = useState("");
  const [times, setTimes] = useState("09:00, 21:00");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [contactOpen, setContactOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactRelationship, setContactRelationship] = useState("");

  const load = useCallback(() => {
    return Promise.all([
      fetchTodayDoses(),
      medicationSchedulesApi.list(),
      careContactsApi.list(),
    ])
      .then(([doses, scheduleRows, contactRows]) => {
        setToday(doses);
        setSchedules(scheduleRows);
        setContact(contactRows[0] ?? null);
        setError("");
      })
      .catch(() => setError("Could not load your reminders."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addSchedule(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await medicationSchedulesApi.create({
        medicine_name: medicineName,
        dosage,
        times: times.split(",").map((value) => value.trim()).filter(Boolean),
        start_date: startDate,
        end_date: endDate,
      });
      setNotice("Reminder added.");
      setFormOpen(false);
      setMedicineName("");
      setDosage("");
      setEndDate("");
      load();
    } catch (problem) {
      const data = problem.response?.data;
      setError(data?.times?.[0] || data?.end_date?.[0] || "Could not add that reminder.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirm(doseId, state) {
    try {
      await markDose(doseId, state);
      setNotice(state === "taken" ? "Marked as taken." : "Marked as skipped.");
      load();
    } catch (problem) {
      setError(problem.response?.data?.detail || "Could not update that dose.");
    }
  }

  async function saveContact(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await careContactsApi.create({
        name: contactName,
        phone: contactPhone,
        relationship: contactRelationship,
        consent_given: true,
      });
      setNotice("Family contact saved.");
      setContactOpen(false);
      load();
    } catch (problem) {
      setError(problem.response?.data?.detail || "Could not save that contact.");
    } finally {
      setIsSaving(false);
    }
  }

  async function stopSchedule(id) {
    try {
      await medicationSchedulesApi.patch(id, { is_active: false });
      setNotice("Reminder stopped.");
      load();
    } catch {
      setError("Could not stop that reminder.");
    }
  }

  const doses = today?.doses ?? [];
  const dueNow = doses.filter((dose) => dose.state === "pending");

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

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

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

      {formOpen && (
        <Card as="form" tone="strong" onSubmit={addSchedule} className="animate-rise mb-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Add a medicine</h2>
            <IconButton onClick={() => setFormOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Medicine"
              required
              placeholder="Metformin"
              value={medicineName}
              onChange={(event) => setMedicineName(event.target.value)}
            />
            <Input
              label="Dose"
              required
              placeholder="1 tablet"
              value={dosage}
              onChange={(event) => setDosage(event.target.value)}
            />
            <Input
              label="Times of day"
              required
              placeholder="09:00, 21:00"
              value={times}
              onChange={(event) => setTimes(event.target.value)}
            />
            <Input
              label="Start"
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <Input
              label="Finish"
              type="date"
              required
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Add reminder"}
            </Button>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {isLoading && <Loading message="Checking today's doses…" />}

      {!isLoading && doses.length === 0 && (
        <EmptyState
          mood="happy"
          title="Nothing due today"
          message="Add a medicine and its times, and each dose will appear here on the day."
        />
      )}

      {doses.length > 0 && (
        <Card className="animate-rise mb-5 p-5">
          <h2 className="mb-4 font-semibold text-ink-900">Today</h2>
          <div className="space-y-2">
            {doses.map((dose) => (
              <div
                key={dose.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/60 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-xs font-semibold text-brand-700">
                    {clockLabel(dose.due_at)}
                  </span>
                  <div>
                    <p className="font-medium text-ink-900">{dose.medicine_name}</p>
                    <p className="text-xs text-ink-500">
                      {dose.dosage}
                      {dose.instructions && ` · ${dose.instructions}`}
                    </p>
                  </div>
                </div>

                {dose.state === "pending" ? (
                  <div className="flex gap-2">
                    <Button onClick={() => confirm(dose.id, "taken")}>
                      <Check size={15} /> Taken
                    </Button>
                    <Button variant="secondary" onClick={() => confirm(dose.id, "skipped")}>
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
                    {!schedule.is_active && (
                      <span className="ml-2 text-xs font-normal text-ink-500">stopped</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-500">
                    {schedule.dosage} · {schedule.times.join(", ")} · until{" "}
                    {new Date(schedule.end_date).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {schedule.adherence !== null && (
                    <Badge tone={schedule.adherence >= 80 ? "success" : "warning"}>
                      {schedule.adherence}% taken
                    </Badge>
                  )}
                  {schedule.is_active && (
                    <button
                      onClick={() => stopSchedule(schedule.id)}
                      className="text-xs font-medium text-ink-500 hover:underline"
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {contact ? (
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
      ) : contactOpen ? (
        <Card as="form" tone="strong" onSubmit={saveContact} className="animate-rise p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Tell a family member if you miss doses</h2>
            <IconButton onClick={() => setContactOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <p className="mb-4 text-sm text-ink-500">
            They are only told if you repeatedly miss the same medicine. You can remove them at any
            time.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Name"
              required
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
            />
            <Input
              label="Phone"
              required
              placeholder="01712345678"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
            />
            <Input
              label="Relationship"
              placeholder="Son"
              value={contactRelationship}
              onChange={(event) => setContactRelationship(event.target.value)}
            />
          </div>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save contact"}
            </Button>
            <Button variant="secondary" onClick={() => setContactOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="animate-rise flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-medium text-ink-900">Want someone told if you miss doses?</p>
            <p className="text-sm text-ink-500">
              Add a family member. Nobody is contacted unless you choose this.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setContactOpen(true)}>
            Add a contact
          </Button>
        </Card>
      )}
    </>
  );
}
