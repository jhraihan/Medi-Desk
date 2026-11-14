import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarPlus, Pencil, UserPlus } from "lucide-react";
import { patientsApi } from "../api.js";
import { useAuth } from "../auth-context.js";
import { canWrite } from "../permissions.js";
import { formatDate, fullName } from "../format.js";
import { useDebounced, useLoader } from "../hooks.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  PageHeader,
  Pager,
  SearchInput,
  Table,
} from "../components/index.js";
import PatientFormModal from "../components/PatientFormModal.jsx";

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm whitespace-pre-line text-ink-900">{children || "—"}</dd>
    </div>
  );
}

export default function Patients() {
  const { user } = useAuth();
  const toast = useToast();
  const mayEdit = canWrite(user?.role, "patients");
  const mayBook = canWrite(user?.role, "appointments");

  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // null = closed, {} = registering a new patient, a patient row = editing them
  const [editing, setEditing] = useState(() => (params.get("new") && mayEdit ? {} : null));
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (params.has("new")) {
      setParams(
        (current) => {
          current.delete("new");
          return current;
        },
        { replace: true },
      );
    }
  }, [params, setParams]);

  const settledSearch = useDebounced(search);
  const load = useCallback(
    () => patientsApi.listPage({ page, ...(settledSearch && { search: settledSearch }) }),
    [page, settledSearch],
  );
  const { data, error, isLoading, reload } = useLoader(load, "Could not load patients.");
  const rows = data?.results ?? [];

  function saved(patient) {
    const isNew = !editing?.id;
    setEditing(null);
    reload();
    if (isNew) {
      toast.success(
        `${fullName(patient.user_details, "Patient")} registered. An admin can set their password from the Admin section.`,
      );
    } else {
      toast.success("Patient details updated.");
      if (viewing?.id === patient.id) setViewing(patient);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Patients"
        subtitle="Find a patient, see their details, or register a walk-in."
        action={
          mayEdit && (
            <Button onClick={() => setEditing({})}>
              <UserPlus size={15} /> Register patient
            </Button>
          )
        }
      />

      <Card className="animate-rise mb-4 p-4 sm:p-5">
        <SearchInput
          placeholder="Search by name or phone"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          className="max-w-md"
        />
      </Card>

      <Alert onRetry={reload}>{error}</Alert>

      <p className="mb-3 text-sm text-ink-500" aria-live="polite">
        {isLoading && !data ? "Loading…" : `${data?.count ?? 0} patient${data?.count === 1 ? "" : "s"}`}
      </p>

      <Table
        columns={["Name", "Record no.", "Age", "Gender", "Blood", "Phone", ""]}
        isLoading={isLoading}
        empty={search ? "No patients match that search." : "No patients registered yet."}
      >
        {rows.map((patient) => (
          <tr
            key={patient.id}
            onClick={() => setViewing(patient)}
            className="cursor-pointer transition-colors duration-150 hover:bg-white/60"
          >
            <td className="px-4 py-3 font-medium text-ink-900">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setViewing(patient);
                }}
                className="text-left hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                {fullName(patient.user_details, `Patient #${patient.id}`)}
              </button>
            </td>
            <td className="px-4 py-3 font-mono text-xs text-ink-500">{patient.medical_record_number}</td>
            <td className="px-4 py-3 text-ink-700">{patient.age ?? "—"}</td>
            <td className="px-4 py-3 capitalize text-ink-700">{patient.gender}</td>
            <td className="px-4 py-3">{patient.blood_group ? <Badge tone="danger">{patient.blood_group}</Badge> : "—"}</td>
            <td className="px-4 py-3 whitespace-nowrap text-ink-700">{patient.phone}</td>
            <td className="px-4 py-3 text-right">
              {mayEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditing(patient);
                  }}
                >
                  <Pencil size={13} /> Edit
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} count={data?.count ?? 0} onChange={setPage} />

      <Modal
        open={Boolean(viewing)}
        size="lg"
        title={viewing ? fullName(viewing.user_details, "Patient") : ""}
        subtitle={viewing?.medical_record_number && `Record ${viewing.medical_record_number}`}
        onClose={() => setViewing(null)}
        footer={
          viewing && (
            <>
              {mayBook && (
                <Link
                  to="/appointments?book=1"
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  <CalendarPlus size={15} /> Book a visit
                </Link>
              )}
              {mayEdit && (
                <Button
                  onClick={() => {
                    setEditing(viewing);
                  }}
                >
                  <Pencil size={14} /> Edit details
                </Button>
              )}
            </>
          )
        }
      >
        {viewing && (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <Detail label="Age">{viewing.age != null && `${viewing.age} years`}</Detail>
            <Detail label="Date of birth">{viewing.date_of_birth && formatDate(viewing.date_of_birth)}</Detail>
            <Detail label="Gender">
              <span className="capitalize">{viewing.gender}</span>
            </Detail>
            <Detail label="Blood group">{viewing.blood_group}</Detail>
            <Detail label="Phone">
              {viewing.phone && (
                <a href={`tel:${viewing.phone}`} className="text-brand-700 hover:underline">
                  {viewing.phone}
                </a>
              )}
            </Detail>
            <Detail label="Email">{viewing.user_details?.email}</Detail>
            <div className="sm:col-span-3">
              <Detail label="Address">{viewing.address}</Detail>
            </div>
            <Detail label="Emergency contact">
              {[viewing.emergency_contact_name, viewing.emergency_contact_phone].filter(Boolean).join(" · ")}
            </Detail>
            <Detail label="Allergies">{viewing.allergies}</Detail>
            <Detail label="Long-term conditions">{viewing.chronic_conditions}</Detail>
          </dl>
        )}
      </Modal>

      {editing && (
        <PatientFormModal
          key={editing.id ?? "new"}
          open
          patient={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
