import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BellRing, ChevronDown, FilePlus2, Pill, Plus, Trash2 } from "lucide-react";
import {
  appointmentsApi,
  dispensePrescription,
  prescriptionsApi,
  remindersFromPrescription,
} from "../api.js";
import { useAuth } from "../auth-context.js";
import { apiError } from "../errors.js";
import { formatDate, formatDateTime } from "../format.js";
import { useDebounced, useLoader } from "../hooks.js";
import { appointmentOption, searchMedicines, searchPrescribableAppointments } from "../pickers.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chips,
  ConfirmDialog,
  IconButton,
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

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "issued", label: "To dispense" },
  { value: "dispensed", label: "Dispensed" },
];

const STATUS_TONES = { draft: "neutral", issued: "warning", dispensed: "success" };
const STATUS_LABELS = { draft: "Draft", issued: "Issued", dispensed: "Dispensed" };

let nextKey = 1;
function blankItem() {
  return { key: nextKey++, medicine: null, dosage: "", frequency: "", duration: "", instructions: "", quantity: "1" };
}

export default function Prescriptions() {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.role;
  const canDispense = ["pharmacist", "admin"].includes(role);
  const canPrescribe = ["doctor", "admin"].includes(role);
  const isPatient = role === "patient";

  // ?new=1&appointment=12 comes from the Prescribe button on an appointment.
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(() => params.get("status") ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [writing, setWriting] = useState(() =>
    params.get("new") && canPrescribe ? { appointment: params.get("appointment") } : null,
  );
  const [dispensing, setDispensing] = useState(null);
  const [reminding, setReminding] = useState(null);
  const [timesPerDay, setTimesPerDay] = useState("2");
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (params.has("new")) {
      setParams(
        (current) => {
          current.delete("new");
          current.delete("appointment");
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
    if (settledSearch) query.search = settledSearch;
    return prescriptionsApi.listPage(query);
  }, [page, status, settledSearch]);
  const { data, error, isLoading, reload } = useLoader(load, "Could not load prescriptions.");
  const rows = data?.results ?? [];

  async function confirmDispense() {
    setIsWorking(true);
    try {
      const result = await dispensePrescription(dispensing.id);
      const units = (result.batches ?? []).reduce((sum, batch) => sum + batch.quantity, 0);
      toast.success(`Dispensed ${units} unit${units === 1 ? "" : "s"} for ${dispensing.patient_name}. Stock updated.`);
      setDispensing(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not dispense this prescription."));
    } finally {
      setIsWorking(false);
    }
  }

  async function confirmReminders() {
    setIsWorking(true);
    try {
      await remindersFromPrescription(reminding.id, Number(timesPerDay));
      toast.success("Reminders set. You'll find today's doses under Reminders.");
      setReminding(null);
    } catch (problem) {
      toast.error(apiError(problem, "Could not set up reminders."));
    } finally {
      setIsWorking(false);
    }
  }

  const columns = [
    !isPatient && "Patient",
    role !== "doctor" && "Doctor",
    "Diagnosis",
    "Medicines",
    "Date",
    "Status",
    "",
  ].filter((column) => column !== false);

  return (
    <div>
      <PageHeader
        eyebrow="Treatment"
        title="Prescriptions"
        subtitle={
          isPatient
            ? "What your doctors prescribed. Open one to see each medicine and how to take it."
            : canDispense && !canPrescribe
              ? "Dispense issued prescriptions from stock."
              : "Write and track prescriptions."
        }
        action={
          canPrescribe && (
            <Button onClick={() => setWriting({})}>
              <FilePlus2 size={15} /> Write prescription
            </Button>
          )
        }
      />

      <Card className="animate-rise mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        {!isPatient && (
          <SearchInput
            placeholder="Search patient or diagnosis"
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            className="sm:w-80"
          />
        )}
        <Chips
          label="Status"
          options={STATUS_FILTERS}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Card>

      <Alert onRetry={reload}>{error}</Alert>

      <p className="mb-3 text-sm text-ink-500" aria-live="polite">
        {isLoading && !data ? "Loading…" : `${data?.count ?? 0} prescription${data?.count === 1 ? "" : "s"}`}
      </p>

      <Table
        columns={columns}
        isLoading={isLoading}
        empty={status || search ? "No prescriptions match." : "No prescriptions yet."}
      >
        {rows.map((prescription) => {
          const items = prescription.prescription_medicines ?? [];
          const open = expanded === prescription.id;
          return (
            <Fragment key={prescription.id}>
              <tr
                onClick={() => setExpanded(open ? null : prescription.id)}
                className={`cursor-pointer transition-colors duration-150 hover:bg-white/60 ${open ? "bg-white/50" : ""}`}
              >
                {!isPatient && <td className="px-4 py-3 font-medium text-ink-900">{prescription.patient_name}</td>}
                {role !== "doctor" && <td className="px-4 py-3 text-ink-700">{prescription.doctor_name}</td>}
                <td className="max-w-xs px-4 py-3 text-ink-700">
                  <p className="line-clamp-2">{prescription.diagnosis}</p>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpanded(open ? null : prescription.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap text-brand-700 hover:bg-brand-50"
                  >
                    <Pill size={13} /> {items.length} item{items.length === 1 ? "" : "s"}
                    <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-700">{formatDate(prescription.created_at)}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONES[prescription.status]}>
                    {STATUS_LABELS[prescription.status] ?? prescription.status}
                  </Badge>
                </td>
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <div className="flex justify-end gap-1.5">
                    {canDispense && prescription.status === "issued" && (
                      <Button size="sm" onClick={() => setDispensing(prescription)}>
                        Dispense
                      </Button>
                    )}
                    {isPatient && items.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setTimesPerDay("2");
                          setReminding(prescription);
                        }}
                      >
                        <BellRing size={13} /> Remind me
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
              {open && (
                <tr className="bg-white/40">
                  <td colSpan={columns.length} className="px-4 pt-1 pb-4">
                    <PrescriptionDetail prescription={prescription} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </Table>
      <Pager page={page} count={data?.count ?? 0} onChange={setPage} />

      {writing && (
        <PrescribeModal
          appointmentId={writing.appointment}
          onClose={() => setWriting(null)}
          onSaved={() => {
            setWriting(null);
            toast.success("Prescription issued. The pharmacy can dispense it now.");
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(dispensing)}
        tone="primary"
        title={`Dispense for ${dispensing?.patient_name ?? "this patient"}?`}
        message="Stock is taken from the batches closest to expiry first."
        confirmLabel="Dispense"
        workingLabel="Dispensing…"
        isWorking={isWorking}
        onConfirm={confirmDispense}
        onCancel={() => setDispensing(null)}
      >
        <ul className="mt-3 space-y-1.5 text-sm">
          {(dispensing?.prescription_medicines ?? []).map((item, index) => (
            <li key={index} className="flex justify-between gap-3 rounded-lg bg-brand-50/60 px-3 py-2">
              <span className="font-medium text-ink-900">{item.medicine_name}</span>
              <span className="text-ink-500">× {item.quantity}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(reminding)}
        tone="primary"
        title="Remind me to take these"
        message="A reminder is set for every medicine on this prescription, for as long as it says to take it."
        confirmLabel="Set reminders"
        workingLabel="Setting up…"
        isWorking={isWorking}
        onConfirm={confirmReminders}
        onCancel={() => setReminding(null)}
      >
        <div className="mt-4">
          <Select label="How many times a day?" value={timesPerDay} onChange={(event) => setTimesPerDay(event.target.value)}>
            <option value="1">Once (9:00)</option>
            <option value="2">Twice (9:00 and 21:00)</option>
            <option value="3">Three times (8:00, 14:00 and 20:00)</option>
          </Select>
          <p className="mt-2 text-xs text-ink-500">
            You can change times later on the <Link to="/reminders" className="text-brand-700 hover:underline">Reminders</Link> page.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function PrescriptionDetail({ prescription }) {
  const items = prescription.prescription_medicines ?? [];
  return (
    <div className="grid gap-4 rounded-xl bg-white/70 p-4 md:grid-cols-[1fr_2fr]">
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Diagnosis</p>
          <p className="text-ink-900">{prescription.diagnosis}</p>
        </div>
        {prescription.notes && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Notes</p>
            <p className="whitespace-pre-line text-ink-700">{prescription.notes}</p>
          </div>
        )}
        {prescription.appointment_date && (
          <p className="text-xs text-ink-500">Visit: {formatDateTime(prescription.appointment_date)}</p>
        )}
        {prescription.follow_up_date && (
          <p className="text-xs font-medium text-brand-700">Follow up on {formatDate(prescription.follow_up_date)}</p>
        )}
      </div>
      <ul className="space-y-2">
        {items.length === 0 && <li className="text-sm text-ink-500">No medicines on this prescription.</li>}
        {items.map((item, index) => (
          <li key={index} className="rounded-xl border border-brand-100 bg-white px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-ink-900">{item.medicine_name ?? `Medicine #${item.medicine}`}</p>
              <span className="text-xs text-ink-500">Qty {item.quantity}</span>
            </div>
            <p className="text-sm text-ink-700">
              {[item.dosage, item.frequency, item.duration && `for ${item.duration}`].filter(Boolean).join(" · ")}
            </p>
            {item.instructions && <p className="text-xs text-ink-500">{item.instructions}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrescribeModal({ appointmentId, onClose, onSaved }) {
  const [appointment, setAppointment] = useState(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [items, setItems] = useState(() => [blankItem()]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Coming from an appointment's Prescribe button, start with that visit chosen.
  useEffect(() => {
    if (!appointmentId) return;
    let active = true;
    appointmentsApi
      .get(appointmentId)
      .then((row) => active && setAppointment(appointmentOption(row)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [appointmentId]);

  function updateItem(key, changes) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!appointment) return setError("Choose the visit this prescription is for.");
    if (items.some((item) => !item.medicine)) return setError("Choose a medicine on every row, or remove the empty row.");

    setIsSaving(true);
    try {
      await prescriptionsApi.create({
        appointment: appointment.value,
        diagnosis,
        notes,
        follow_up_date: followUp || null,
        medicines: items.map((item) => ({
          medicine: item.medicine.value,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructions,
          quantity: Number(item.quantity) || 1,
        })),
      });
      onSaved();
    } catch (problem) {
      setError(apiError(problem, "Could not save that prescription."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      size="xl"
      title="Write a prescription"
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
            {isSaving ? "Issuing…" : "Issue prescription"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SearchPicker
          label="Visit"
          required
          placeholder="Type the patient's name…"
          hint="Visits that already have a prescription aren't listed."
          value={appointment}
          onChange={setAppointment}
          search={searchPrescribableAppointments}
        />

        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <Textarea label="Diagnosis" required rows={2} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} />
          <Input label="Follow-up date" type="date" value={followUp} onChange={(event) => setFollowUp(event.target.value)} />
        </div>
        <Textarea label="Notes for the patient" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />

        <fieldset className="rounded-2xl border border-brand-100 p-4">
          <legend className="px-1 text-sm font-semibold text-ink-900">Medicines</legend>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.key} className="rounded-xl bg-brand-50/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">#{index + 1}</span>
                  {items.length > 1 && (
                    <IconButton
                      variant="danger"
                      label="Remove this medicine"
                      onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-6">
                  <div className="md:col-span-3">
                    <SearchPicker
                      label="Medicine"
                      required
                      placeholder="Type a medicine name…"
                      value={item.medicine}
                      onChange={(medicine) => updateItem(item.key, { medicine })}
                      search={searchMedicines}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      label="Dosage"
                      required
                      placeholder="1 tablet"
                      value={item.dosage}
                      onChange={(event) => updateItem(item.key, { dosage: event.target.value })}
                    />
                  </div>
                  <Input
                    label="Qty"
                    type="number"
                    min="1"
                    required
                    value={item.quantity}
                    onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                  />
                  <div className="md:col-span-2">
                    <Input
                      label="How often"
                      placeholder="Twice daily"
                      value={item.frequency}
                      onChange={(event) => updateItem(item.key, { frequency: event.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      label="For how long"
                      required
                      placeholder="7 days"
                      value={item.duration}
                      onChange={(event) => updateItem(item.key, { duration: event.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      label="Instructions"
                      placeholder="After meals"
                      value={item.instructions}
                      onChange={(event) => updateItem(item.key, { instructions: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setItems((current) => [...current, blankItem()])}>
            <Plus size={14} /> Add another medicine
          </Button>
        </fieldset>
      </div>
    </Modal>
  );
}
