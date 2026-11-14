import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BellRing, ChevronDown, FilePlus2, FlaskConical, Pencil, Pill, Plus, Printer, Receipt, Trash2 } from "lucide-react";
import {
  appointmentsApi,
  dispensePrescription,
  openPrintable,
  prescriptionsApi,
  remindersFromPrescription,
} from "../api.js";
import { useAuth } from "../auth-context.js";
import { apiError } from "../errors.js";
import { formatDate, formatDateTime, money } from "../format.js";
import { useDebounced, useLoader } from "../hooks.js";
import { appointmentOption, searchLabTests, searchMedicines, searchPrescribableAppointments } from "../pickers.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chips,
  ConfirmDialog,
  DownloadPdfButton,
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

function blankTest() {
  return { key: nextKey++, test: null, instructions: "" };
}

const TEST_TONES = { ordered: "warning", completed: "success", cancelled: "neutral" };
const TEST_LABELS = { ordered: "Waiting", completed: "Result ready", cancelled: "Cancelled" };

export default function Prescriptions() {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.role;
  const canDispense = ["pharmacist", "admin"].includes(role);
  const canPrescribe = ["doctor", "admin"].includes(role);
  const isPatient = role === "patient";
  const canSeeBills = ["doctor", "admin", "patient"].includes(role);

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
  const [justIssued, setJustIssued] = useState(null);

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
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openPrintable(`/print/prescription/${prescription.id}`)}
                    >
                      <Printer size={13} /> Print
                    </Button>
                    <DownloadPdfButton
                      path={`prescriptions/${prescription.id}/pdf/`}
                      filename={`prescription-RX${String(prescription.id).padStart(6, "0")}.pdf`}
                    />
                    {canSeeBills && prescription.bill_id && (
                      <Button size="sm" variant="ghost" onClick={() => openPrintable(`/print/bill/${prescription.bill_id}`)}>
                        <Receipt size={13} /> Bill
                      </Button>
                    )}
                    {canPrescribe && prescription.status !== "dispensed" && (
                      <Button size="sm" variant="ghost" onClick={() => setWriting({ existing: prescription })}>
                        <Pencil size={13} /> Edit
                      </Button>
                    )}
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
          existing={writing.existing}
          onClose={() => setWriting(null)}
          onSaved={(prescription) => {
            const updated = Boolean(writing.existing);
            setWriting(null);
            toast.success(
              updated
                ? "Prescription updated. The bill now matches it."
                : "Prescription issued and added to the patient's bill.",
            );
            setJustIssued(prescription);
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(justIssued)}
        tone="primary"
        title="Print the prescription?"
        message={`Hand ${justIssued?.patient_name ?? "the patient"} a printed copy. The medicines and tests are already on their bill.`}
        confirmLabel="Print now"
        workingLabel="Opening…"
        onConfirm={() => {
          openPrintable(`/print/prescription/${justIssued.id}`);
          setJustIssued(null);
        }}
        onCancel={() => setJustIssued(null)}
      />

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
  const tests = prescription.test_orders ?? [];
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
        {tests.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Tests</p>
            <ul className="mt-1 space-y-1.5">
              {tests.map((test) => (
                <li key={test.id} className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-brand-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium text-ink-900">
                      <FlaskConical size={13} className="text-brand-600" /> {test.test_name}
                    </span>
                    <Badge tone={TEST_TONES[test.status]}>{TEST_LABELS[test.status] ?? test.status}</Badge>
                  </div>
                  {test.result && (
                    <p className={`mt-1 text-xs ${test.result_flag === "abnormal" ? "text-rose-700" : "text-ink-700"}`}>
                      {test.result}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
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

// The options the pickers show, rebuilt from what a saved prescription returns.
function itemsFrom(prescription) {
  return (prescription.prescription_medicines ?? []).map((item) => ({
    key: nextKey++,
    medicine: {
      value: item.medicine,
      label: item.medicine_name,
      hint: item.generic_name,
      price: item.unit_price,
      unit: item.medicine_unit,
    },
    dosage: item.dosage ?? "",
    frequency: item.frequency ?? "",
    duration: item.duration ?? "",
    instructions: item.instructions ?? "",
    quantity: String(item.quantity ?? 1),
  }));
}

// Tests still waiting can be changed; ones with a result stay on record as they are.
function testsFrom(prescription) {
  return (prescription.test_orders ?? [])
    .filter((order) => order.status === "ordered")
    .map((order) => ({
      key: nextKey++,
      test: { value: order.test, label: order.test_name, price: order.price },
      instructions: order.instructions ?? "",
    }));
}

function PrescribeModal({ appointmentId, existing, onClose, onSaved }) {
  const editing = Boolean(existing);
  const [appointment, setAppointment] = useState(() =>
    existing
      ? { value: existing.appointment, label: existing.patient_name, hint: formatDateTime(existing.appointment_date) }
      : null,
  );
  const [diagnosis, setDiagnosis] = useState(existing?.diagnosis ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [followUp, setFollowUp] = useState(existing?.follow_up_date ?? "");
  const [items, setItems] = useState(() => (existing ? itemsFrom(existing) : [blankItem()]));
  const [tests, setTests] = useState(() => (existing ? testsFrom(existing) : []));
  const reported = (existing?.test_orders ?? []).filter((order) => order.status === "completed");
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

  function updateTest(key, changes) {
    setTests((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  const medicineCost = items.reduce(
    (sum, item) => sum + (item.medicine ? Number(item.medicine.price ?? 0) * (Number(item.quantity) || 0) : 0),
    0,
  );
  const testCost = tests.reduce((sum, row) => sum + (row.test ? Number(row.test.price ?? 0) : 0), 0);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!appointment) return setError("Choose the visit this prescription is for.");
    const medicines = items.filter((item) => item.medicine || item.dosage || item.duration);
    if (medicines.some((item) => !item.medicine)) return setError("Choose a medicine on every row, or remove the empty row.");
    if (tests.some((row) => !row.test)) return setError("Choose a test on every test row, or remove the empty row.");

    setIsSaving(true);
    try {
      const save = editing ? (payload) => prescriptionsApi.patch(existing.id, payload) : prescriptionsApi.create;
      const saved = await save({
        appointment: appointment.value,
        diagnosis,
        notes,
        follow_up_date: followUp || null,
        tests: tests.map((row) => ({ test: row.test.value, instructions: row.instructions })),
        medicines: medicines.map((item) => ({
          medicine: item.medicine.value,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructions,
          quantity: Number(item.quantity) || 1,
        })),
      });
      onSaved(saved);
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
      title={editing ? `Edit prescription · ${existing.patient_name}` : "Write a prescription"}
      subtitle={editing ? "Add or change medicines and tests. The patient's bill follows the changes." : undefined}
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
            {isSaving ? "Saving…" : editing ? "Save changes" : "Issue prescription"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {editing ? (
          <div className="rounded-xl bg-brand-50/70 px-4 py-3 text-sm">
            <p className="font-medium text-ink-900">{existing.patient_name}</p>
            <p className="text-ink-500">Visit {formatDateTime(existing.appointment_date)}</p>
          </div>
        ) : (
          <SearchPicker
            label="Visit"
            required
            placeholder="Type the patient's name…"
            hint="Visits that already have a prescription aren't listed."
            value={appointment}
            onChange={setAppointment}
            search={searchPrescribableAppointments}
          />
        )}

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
                  {(items.length > 1 || tests.length > 0) && (
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

        <fieldset className="rounded-2xl border border-brand-100 p-4">
          <legend className="px-1 text-sm font-semibold text-ink-900">Tests</legend>
          {reported.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {reported.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                  <span className="font-medium text-ink-900">{order.test_name}</span>
                  <span className="text-xs text-emerald-700">Result ready · kept on record</span>
                </li>
              ))}
            </ul>
          )}
          {tests.length === 0 && <p className="text-sm text-ink-500">No tests waiting to be done.</p>}
          <div className="space-y-3">
            {tests.map((row) => (
              <div key={row.key} className="grid items-end gap-3 rounded-xl bg-brand-50/50 p-3 md:grid-cols-[3fr_3fr_auto]">
                <SearchPicker
                  label="Test"
                  required
                  placeholder="CBC, X-ray, ECG…"
                  value={row.test}
                  onChange={(test) => updateTest(row.key, { test })}
                  search={searchLabTests}
                />
                <Input
                  label="Note for the lab"
                  placeholder="Fasting, left knee…"
                  value={row.instructions}
                  onChange={(event) => updateTest(row.key, { instructions: event.target.value })}
                />
                <IconButton
                  variant="danger"
                  label="Remove this test"
                  onClick={() => setTests((current) => current.filter((test) => test.key !== row.key))}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setTests((current) => [...current, blankTest()])}>
            <FlaskConical size={14} /> Order a test
          </Button>
        </fieldset>

        {(medicineCost > 0 || testCost > 0) && (
          <p className="rounded-xl bg-brand-50/70 px-4 py-3 text-sm text-ink-700">
            Adds <span className="font-semibold text-ink-900">{money(medicineCost + testCost)}</span> to the
            patient's bill ({money(medicineCost)} medicines, {money(testCost)} tests), on top of the consultation fee.
          </p>
        )}
      </div>
    </Modal>
  );
}
