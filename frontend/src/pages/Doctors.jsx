import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, GraduationCap, Pencil, Phone, Stethoscope, UserCog, UserPlus } from "lucide-react";
import { departmentsApi, doctorsApi } from "../api.js";
import { apiError } from "../errors.js";
import { useAuth } from "../auth-context.js";
import { canWrite } from "../permissions.js";
import { money } from "../format.js";
import { useDebounced, useLoader } from "../hooks.js";
import { doctorLabel } from "../pickers.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chips,
  EmptyState,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pager,
  SearchInput,
  Select,
} from "../components/index.js";

const CLINIC_STATUS = {
  in_clinic: { label: "In clinic", tone: "success" },
  on_break: { label: "On a break", tone: "warning" },
  running_late: { label: "Running late", tone: "warning" },
  unavailable: { label: "Away today", tone: "danger" },
};

const AVAILABILITY = [
  { value: "", label: "All doctors" },
  { value: "true", label: "Taking bookings" },
  { value: "false", label: "Not taking bookings" },
];

export default function Doctors() {
  const { user } = useAuth();
  const toast = useToast();
  const mayEdit = canWrite(user?.role, "doctors");
  const mayBook = canWrite(user?.role, "appointments") && user?.role !== "doctor";

  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("");
  const [page, setPage] = useState(1);
  const [workingId, setWorkingId] = useState(null);
  const [editing, setEditing] = useState(null);
  const isAdmin = user?.role === "admin";

  const settledSearch = useDebounced(search);
  const load = useCallback(() => {
    const query = { page };
    if (settledSearch) query.search = settledSearch;
    if (availability) query.is_available = availability;
    return doctorsApi.listPage(query);
  }, [page, settledSearch, availability]);
  const { data, error, isLoading, reload } = useLoader(load, "Could not load doctors.");
  const rows = data?.results ?? [];

  async function toggleAvailability(doctor) {
    setWorkingId(doctor.id);
    try {
      await doctorsApi.patch(doctor.id, { is_available: !doctor.is_available });
      toast.success(
        doctor.is_available
          ? `${doctorLabel(doctor)} no longer takes new bookings.`
          : `${doctorLabel(doctor)} is taking bookings again.`,
      );
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not update availability."));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Care team"
        title="Doctors"
        subtitle={mayBook ? "Find the right doctor and book a visit." : "Who is on the team, and who is taking bookings."}
        action={
          isAdmin && (
            <Link
              to="/admin/users?new=doctor"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <UserPlus size={15} /> Add doctor
            </Link>
          )
        }
      />

      <Card className="animate-rise mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <SearchInput
          placeholder="Search by name or speciality"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          className="sm:w-80"
        />
        <Chips
          label="Availability"
          options={AVAILABILITY}
          value={availability}
          onChange={(value) => {
            setAvailability(value);
            setPage(1);
          }}
        />
      </Card>

      <Alert onRetry={reload}>{error}</Alert>

      {isLoading && !data && <Loading message="Finding doctors…" />}

      {data && rows.length === 0 && (
        <EmptyState
          title={search || availability ? "No doctors match" : "No doctors yet"}
          message={search || availability ? "Try a different name or speciality." : "Doctors appear here once an admin adds them."}
        />
      )}

      <div
        className={`stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${isLoading && data ? "opacity-60" : ""}`}
        aria-busy={isLoading || undefined}
      >
        {rows.map((doctor) => {
          const clinic = CLINIC_STATUS[doctor.clinic_status];
          const initials = (doctor.user_details?.first_name?.[0] ?? "D").toUpperCase();
          return (
            <Card key={doctor.id} className="lift flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-lg font-semibold text-white">
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{doctorLabel(doctor)}</p>
                  {doctor.designation && <p className="truncate text-xs font-medium text-brand-700">{doctor.designation}</p>}
                  <p className="flex items-center gap-1 truncate text-sm text-ink-500">
                    <Stethoscope size={13} /> {doctor.specialization}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={doctor.is_available ? "success" : "neutral"}>
                  {doctor.is_available ? "Taking bookings" : "Not taking bookings"}
                </Badge>
                {doctor.is_available && clinic && doctor.clinic_status !== "in_clinic" && (
                  <Badge tone={clinic.tone}>{clinic.label}</Badge>
                )}
              </div>
              {doctor.status_note && <p className="mt-2 text-xs text-ink-500">{doctor.status_note}</p>}

              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-white/60 px-3 py-2">
                  <dt className="text-xs text-ink-500">Experience</dt>
                  <dd className="font-medium text-ink-900">{doctor.experience} yrs</dd>
                </div>
                <div className="rounded-xl bg-white/60 px-3 py-2">
                  <dt className="text-xs text-ink-500">Consultation</dt>
                  <dd className="font-medium text-ink-900">{money(doctor.consultation_fee)}</dd>
                </div>
              </dl>

              {(doctor.qualification || doctor.phone) && (
                <div className="mt-3 space-y-1 text-xs text-ink-500">
                  {doctor.qualification && (
                    <p className="flex items-center gap-1.5">
                      <GraduationCap size={13} /> {doctor.qualification}
                    </p>
                  )}
                  {doctor.phone && user?.role !== "patient" && (
                    <p className="flex items-center gap-1.5">
                      <Phone size={13} /> {doctor.phone}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-white/70 pt-3">
                {mayBook && doctor.is_available && (
                  <Link
                    to={`/appointments?book=1&doctor=${doctor.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                  >
                    <CalendarPlus size={14} /> Book
                  </Link>
                )}
                {mayEdit && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(doctor)}>
                    <Pencil size={13} /> Edit
                  </Button>
                )}
                {isAdmin && doctor.user_details?.username && (
                  <Link
                    to={`/admin/users?search=${encodeURIComponent(doctor.user_details.username)}`}
                    title="Name, email, sign-in and password"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-white/70"
                  >
                    <UserCog size={13} /> Account
                  </Link>
                )}
                {mayEdit && (
                  <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-700">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={doctor.is_available}
                      disabled={workingId === doctor.id}
                      onChange={() => toggleAvailability(doctor)}
                      className="peer sr-only"
                    />
                    <span className="relative h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 peer-disabled:opacity-60 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
                    Accepting bookings
                  </label>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <Pager page={page} count={data?.count ?? 0} onChange={setPage} />

      {editing && (
        <DoctorProfileModal
          doctor={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            toast.success(`${doctorLabel(saved)} updated.`);
            reload();
          }}
        />
      )}
    </div>
  );
}

const PROFILE_FIELDS = ["department", "specialization", "designation", "qualification", "phone", "experience", "consultation_fee"];

// Everything on the doctor's profile. Their name, email and sign-in live on the
// account, under Admin -> Users & roles.
function DoctorProfileModal({ doctor, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(PROFILE_FIELDS.map((name) => [name, doctor[name] ?? ""])),
  );
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    departmentsApi.listAll().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  function field(name) {
    return {
      value: form[name] ?? "",
      onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const saved = await doctorsApi.patch(doctor.id, {
        ...form,
        department: form.department ? Number(form.department) : null,
        experience: Number(form.experience || 0),
        consultation_fee: form.consultation_fee || "0",
      });
      onSaved(saved);
    } catch (problem) {
      setError(apiError(problem, "Could not save the doctor's profile."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={`Edit ${doctorLabel(doctor)}`}
      subtitle="Shown to patients and printed on prescriptions. A new fee applies to visits billed from now on."
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
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Department" placeholder="No department" {...field("department")}>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        <Input label="Specialization" required {...field("specialization")} />
        <Input label="Designation" placeholder="Senior Consultant" {...field("designation")} />
        <Input label="Qualification" placeholder="MBBS, FCPS" {...field("qualification")} />
        <Input label="Phone" required {...field("phone")} />
        <Input label="Years of experience" type="number" min="0" {...field("experience")} />
        <Input label="Consultation fee (৳)" type="number" min="0" step="0.01" {...field("consultation_fee")} />
      </div>
    </Modal>
  );
}
