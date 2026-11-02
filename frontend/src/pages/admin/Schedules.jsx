import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { doctorSchedulesApi, doctorsApi } from "../../api.js";
import { apiError } from "../../errors.js";
import { useToast } from "../../toast-context.js";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Pager,
  Select,
  Table,
} from "../../components/index.js";

// Matches DoctorSchedule.Weekday: Monday is 0.
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const EMPTY = { doctor: "", weekday: "0", start_time: "09:00", end_time: "13:00" };

function doctorLabel(doctor) {
  const name = [doctor.user_details?.first_name, doctor.user_details?.last_name].filter(Boolean).join(" ");
  return `Dr. ${name || doctor.user_details?.username} · ${doctor.specialization}`;
}

export default function Schedules() {
  const [doctors, setDoctors] = useState([]);
  const [doctorFilter, setDoctorFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, results: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const toast = useToast();

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [isSaving, setIsSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((c) => c + 1);

  useEffect(() => {
    doctorsApi.listAll().then(setDoctors).catch(() => setDoctors([]));
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const params = { page, ordering: "weekday,start_time" };
        if (doctorFilter) params.doctor = doctorFilter;
        setData(await doctorSchedulesApi.listPage(params));
        setError("");
      } catch (problem) {
        setError(apiError(problem, "Could not load schedules."));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [page, doctorFilter, reloadCount]);

  function open(session) {
    setFormError("");
    setEditing(session);
    setForm(
      session.id
        ? {
            doctor: String(session.doctor),
            weekday: String(session.weekday),
            start_time: session.start_time.slice(0, 5),
            end_time: session.end_time.slice(0, 5),
          }
        : { ...EMPTY, doctor: doctorFilter },
    );
  }

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      const payload = { ...form, doctor: Number(form.doctor), weekday: Number(form.weekday) };
      if (editing.id) await doctorSchedulesApi.update(editing.id, payload);
      else await doctorSchedulesApi.create(payload);
      toast.success("Session saved. Patients can book it straight away.");
      setEditing(null);
      reload();
    } catch (problem) {
      setFormError(apiError(problem, "Could not save that session."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    setIsSaving(true);
    try {
      await doctorSchedulesApi.remove(removing.id);
      toast.success("Session removed.");
      setRemoving(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not remove that session."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="animate-fade">
      <Alert onRetry={reload}>{error}</Alert>

      <Card className="mb-5 p-5 sm:max-w-md">
        <Select
          label="Doctor"
          placeholder="All doctors"
          value={doctorFilter}
          onChange={(e) => {
            setDoctorFilter(e.target.value);
            setPage(1);
          }}
        >
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctorLabel(doctor)}
            </option>
          ))}
        </Select>
      </Card>

      <Modal
        open={Boolean(editing)}
        size="lg"
        title={editing?.id ? "Edit session" : "New clinic session"}
        subtitle="Patients can book this doctor during these hours every week."
        error={formError}
        busy={isSaving}
        onClose={() => setEditing(null)}
        onSubmit={handleSave}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" busy={isSaving}>
              {isSaving ? "Saving..." : "Save session"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Doctor"
            placeholder="Select doctor"
            required
            value={form.doctor}
            onChange={(e) => setForm({ ...form, doctor: e.target.value })}
          >
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctorLabel(doctor)}
              </option>
            ))}
          </Select>
          <Select
            label="Day"
            required
            value={form.weekday}
            onChange={(e) => setForm({ ...form, weekday: e.target.value })}
          >
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </Select>
          <Input
            label="Starts"
            type="time"
            required
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
          />
          <Input
            label="Ends"
            type="time"
            required
            value={form.end_time}
            onChange={(e) => setForm({ ...form, end_time: e.target.value })}
          />
        </div>
      </Modal>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">{isLoading ? "Loading..." : `${data.count} weekly sessions`}</h2>
        <Button onClick={() => open({})}>
          <Plus size={14} /> New session
        </Button>
      </div>

      {!isLoading && data.count === 0 ? (
        <EmptyState
          title="No clinic sessions"
          message="Bookable slots come from these sessions. Add the hours each doctor works."
        />
      ) : (
        <Table columns={["Doctor", "Day", "Hours", ""]} isLoading={isLoading}>
          {data.results.map((session) => (
            <tr key={session.id} className="transition-colors duration-150 hover:bg-white/60">
              <td className="px-4 py-3 font-medium text-ink-900">{session.doctor_name}</td>
              <td className="px-4 py-3 text-ink-700">{session.weekday_display}</td>
              <td className="px-4 py-3 text-ink-700">
                {session.start_time.slice(0, 5)} – {session.end_time.slice(0, 5)}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => open(session)}>
                    <Pencil size={13} /> Edit
                  </Button>
                  <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(session)}>
                    <Trash2 size={13} /> Remove
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} count={data.count} onChange={setPage} />

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this session?"
        message="Existing appointments stay booked. No new slots are offered for these hours."
        confirmLabel="Remove"
        workingLabel="Removing..."
        isWorking={isSaving}
        onConfirm={handleRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
