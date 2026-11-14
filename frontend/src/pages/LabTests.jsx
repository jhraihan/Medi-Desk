import { useCallback, useState } from "react";
import { FlaskConical, Printer } from "lucide-react";
import { openPrintable, testOrdersApi } from "../api.js";
import { useAuth } from "../auth-context.js";
import { apiError } from "../errors.js";
import { formatDateTime, money } from "../format.js";
import { useDebounced, useLoader } from "../hooks.js";
import { searchLabTests, searchOpenAppointments } from "../pickers.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chips,
  ConfirmDialog,
  DownloadPdfButton,
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
  { value: "ordered", label: "Waiting" },
  { value: "completed", label: "Result ready" },
  { value: "", label: "All" },
];
const STATUS_TONES = { ordered: "warning", completed: "success", cancelled: "neutral" };
const STATUS_LABELS = { ordered: "Waiting", completed: "Result ready", cancelled: "Cancelled" };

export default function LabTests() {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.role;
  const isPatient = role === "patient";
  const canOrder = ["doctor", "admin", "receptionist"].includes(role);
  const canRecord = ["doctor", "admin", "receptionist"].includes(role);

  const [status, setStatus] = useState(isPatient ? "" : "ordered");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState(false);
  const [recording, setRecording] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [isWorking, setIsWorking] = useState(false);

  const settledSearch = useDebounced(search);
  const load = useCallback(() => {
    const query = { page };
    if (status) query.status = status;
    if (settledSearch) query.search = settledSearch;
    return testOrdersApi.listPage(query);
  }, [page, status, settledSearch]);
  const { data, error, isLoading, reload } = useLoader(load, "Could not load tests.");
  const rows = data?.results ?? [];

  async function confirmCancel() {
    setIsWorking(true);
    try {
      await testOrdersApi.patch(cancelling.id, { status: "cancelled" });
      toast.success(`${cancelling.test_name} cancelled and taken off the bill.`);
      setCancelling(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not cancel that test."));
    } finally {
      setIsWorking(false);
    }
  }

  const columns = [!isPatient && "Patient", "Test", "Ordered", "Status", "Result", ""].filter(Boolean);

  return (
    <div>
      <PageHeader
        eyebrow="Diagnostics"
        title={isPatient ? "Your tests" : "Lab tests"}
        subtitle={
          isPatient
            ? "Tests your doctors ordered, and their results as soon as they're ready."
            : "Tests ordered by doctors. Record results here; the patient sees them straight away."
        }
        action={
          canOrder && (
            <Button onClick={() => setOrdering(true)}>
              <FlaskConical size={15} /> Order a test
            </Button>
          )
        }
      />

      <Card className="animate-rise mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        {!isPatient && (
          <SearchInput
            placeholder="Patient, record no. or test"
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
        {isLoading && !data ? "Loading…" : `${data?.count ?? 0} test${data?.count === 1 ? "" : "s"}`}
      </p>

      <Table columns={columns} isLoading={isLoading} empty={status === "ordered" ? "Nothing waiting for a result." : "No tests yet."}>
        {rows.map((order) => (
          <tr key={order.id} className="transition-colors duration-150 hover:bg-white/60">
            {!isPatient && (
              <td className="px-4 py-3">
                <p className="font-medium text-ink-900">{order.patient_name}</p>
                <p className="text-xs text-ink-500">{order.patient_mrn}</p>
              </td>
            )}
            <td className="px-4 py-3">
              <p className="font-medium text-ink-900">{order.test_name}</p>
              <p className="text-xs text-ink-500">
                {order.test_category} · {money(order.price)}
                {order.instructions && ` · ${order.instructions}`}
              </p>
            </td>
            <td className="px-4 py-3 text-ink-700">
              <p>{formatDateTime(order.ordered_at)}</p>
              <p className="text-xs text-ink-500">{order.doctor_name}</p>
            </td>
            <td className="px-4 py-3">
              <Badge tone={STATUS_TONES[order.status]}>{STATUS_LABELS[order.status] ?? order.status}</Badge>
              {order.result_flag === "abnormal" && (
                <p className="mt-1 text-xs font-medium text-rose-600">Needs attention</p>
              )}
            </td>
            <td className="max-w-xs px-4 py-3 text-ink-700">
              <p className="line-clamp-2">{order.result || "—"}</p>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap justify-end gap-1.5">
                {canRecord && order.status === "ordered" && (
                  <Button size="sm" onClick={() => setRecording(order)}>
                    Enter result
                  </Button>
                )}
                {order.status === "completed" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openPrintable(`/print/lab/${order.id}`)}>
                      <Printer size={13} /> Report
                    </Button>
                    <DownloadPdfButton
                      path={`test-orders/${order.id}/pdf/`}
                      filename={`lab-report-${String(order.id).padStart(6, "0")}.pdf`}
                    />
                  </>
                )}
                {canRecord && order.status === "ordered" && (
                  <Button size="sm" variant="danger-ghost" onClick={() => setCancelling(order)}>
                    Cancel
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} count={data?.count ?? 0} onChange={setPage} />

      {ordering && (
        <OrderModal
          onClose={() => setOrdering(false)}
          onSaved={(order) => {
            setOrdering(false);
            toast.success(`${order.test_name} ordered for ${order.patient_name} and added to the bill.`);
            reload();
          }}
        />
      )}

      {recording && (
        <ResultModal
          order={recording}
          onClose={() => setRecording(null)}
          onSaved={(order) => {
            setRecording(null);
            toast.success(`Result saved. ${order.patient_name} can see it now.`);
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(cancelling)}
        title={`Cancel ${cancelling?.test_name ?? "this test"}?`}
        message="It comes off the patient's bill if nothing has been paid yet."
        confirmLabel="Cancel test"
        workingLabel="Cancelling…"
        isWorking={isWorking}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}

function OrderModal({ onClose, onSaved }) {
  const [appointment, setAppointment] = useState(null);
  const [test, setTest] = useState(null);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!appointment || !test) return setError("Choose the visit and the test.");
    setIsSaving(true);
    try {
      onSaved(await testOrdersApi.create({ appointment: appointment.value, test: test.value, instructions }));
    } catch (problem) {
      setError(apiError(problem, "Could not order that test."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Order a test"
      subtitle="The test is added to the visit's bill at its catalogue price."
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
            {isSaving ? "Ordering…" : "Order test"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SearchPicker
          label="Visit"
          required
          placeholder="Type the patient's name…"
          value={appointment}
          onChange={setAppointment}
          search={searchOpenAppointments}
        />
        <SearchPicker label="Test" required placeholder="CBC, X-ray, ECG…" value={test} onChange={setTest} search={searchLabTests} />
        <Input
          label="Note for the lab"
          placeholder="Fasting, left knee…"
          maxLength={255}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </div>
    </Modal>
  );
}

function ResultModal({ order, onClose, onSaved }) {
  const [result, setResult] = useState("");
  const [flag, setFlag] = useState("normal");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      onSaved(await testOrdersApi.patch(order.id, { status: "completed", result: result.trim(), result_flag: flag }));
    } catch (problem) {
      setError(apiError(problem, "Could not save that result."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`Result: ${order.test_name}`}
      subtitle={`${order.patient_name} · ordered by ${order.doctor_name}`}
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
            {isSaving ? "Saving…" : "Save result"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {order.instructions && <p className="text-sm text-ink-500">Note: {order.instructions}</p>}
        <Textarea
          label="Result"
          required
          rows={4}
          placeholder="Hb 13.4 g/dL, WBC 7,800/µL…"
          value={result}
          onChange={(event) => setResult(event.target.value)}
        />
        <Select label="Interpretation" value={flag} onChange={(event) => setFlag(event.target.value)}>
          <option value="normal">Normal</option>
          <option value="abnormal">Needs attention</option>
        </Select>
      </div>
    </Modal>
  );
}
