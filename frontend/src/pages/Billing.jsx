import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, Plus, Wallet } from "lucide-react";
import { billsApi, openInvoice, payBill } from "../api.js";
import { apiError } from "../errors.js";
import { useAuth } from "../auth-context.js";
import { canWrite } from "../permissions.js";
import { formatDate, formatDateTime, localISODate, money } from "../format.js";
import { useDebounced, useLoader } from "../hooks.js";
import { searchPatients } from "../pickers.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chips,
  Input,
  Modal,
  PageHeader,
  Pager,
  SearchInput,
  SearchPicker,
  Select,
  Table,
} from "../components/index.js";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
];

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Bank / mobile transfer" },
  { value: "insurance", label: "Insurance" },
];

function billState(bill) {
  if (bill.paid) return { label: "Paid", tone: "success" };
  if (bill.due_date && bill.due_date < localISODate()) return { label: "Overdue", tone: "danger" };
  if (Number(bill.amount_paid) > 0) return { label: "Part paid", tone: "warning" };
  return { label: "Unpaid", tone: "danger" };
}

export default function Billing() {
  const { user } = useAuth();
  const toast = useToast();
  const mayEdit = canWrite(user?.role, "bills");
  const isPatient = user?.role === "patient";

  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(() => params.get("status") ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(() => Boolean(params.get("new")) && mayEdit);
  const [paying, setPaying] = useState(null);
  const [openingId, setOpeningId] = useState(null);

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
  const load = useCallback(() => {
    const query = { page };
    if (status) query.paid = status === "paid";
    if (settledSearch) query.search = settledSearch;
    return billsApi.listPage(query);
  }, [page, status, settledSearch]);
  const { data, error, isLoading, reload } = useLoader(load, "Could not load bills.");
  const rows = data?.results ?? [];

  async function showInvoice(bill) {
    setOpeningId(bill.id);
    try {
      await openInvoice(bill.id);
    } catch (problem) {
      toast.error(apiError(problem, "Could not open that invoice."));
    } finally {
      setOpeningId(null);
    }
  }

  const columns = ["Invoice", !isPatient && "Patient", "Total", "Paid", "Status", ""].filter(
    (column) => column !== false,
  );

  return (
    <div>
      <PageHeader
        eyebrow="Payments"
        title={isPatient ? "Your bills" : "Billing"}
        subtitle={isPatient ? "What you owe, what you've paid, and every invoice." : "Raise invoices and record payments."}
        action={
          mayEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={15} /> New bill
            </Button>
          )
        }
      />

      <Card className="animate-rise mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        {!isPatient && (
          <SearchInput
            placeholder="Invoice number or patient"
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
        {isLoading && !data ? "Loading…" : `${data?.count ?? 0} bill${data?.count === 1 ? "" : "s"}`}
      </p>

      <Table
        columns={columns}
        isLoading={isLoading}
        empty={status || search ? "No bills match." : isPatient ? "You have no bills." : "No bills yet."}
      >
        {rows.map((bill) => {
          const state = billState(bill);
          const balance = Number(bill.balance ?? 0);
          return (
            <tr key={bill.id} className="transition-colors duration-150 hover:bg-white/60">
              <td className="px-4 py-3">
                <p className="font-mono text-xs font-medium text-ink-900">{bill.invoice_number || `#${bill.id}`}</p>
                <p className="text-xs text-ink-500">
                  {formatDate(bill.created_at)}
                  {bill.due_date && !bill.paid && ` · due ${formatDate(bill.due_date)}`}
                </p>
              </td>
              {!isPatient && (
                <td className="px-4 py-3 text-ink-900">{bill.patient_name ?? `Patient #${bill.patient}`}</td>
              )}
              <td className="px-4 py-3 font-medium whitespace-nowrap text-ink-900">{money(bill.total ?? bill.amount)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-ink-700">
                {money(bill.amount_paid)}
                {balance > 0 && <p className="text-xs font-medium text-rose-600">{money(balance)} due</p>}
              </td>
              <td className="px-4 py-3">
                <Badge tone={state.tone}>{state.label}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  {mayEdit && !bill.paid && (
                    <Button size="sm" onClick={() => setPaying(bill)}>
                      <Wallet size={13} /> Take payment
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" busy={openingId === bill.id} onClick={() => showInvoice(bill)}>
                    {openingId !== bill.id && <FileText size={13} />} Invoice
                  </Button>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      <Pager page={page} count={data?.count ?? 0} onChange={setPage} />

      {creating && (
        <NewBillModal
          onClose={() => setCreating(false)}
          onSaved={(bill) => {
            setCreating(false);
            toast.success(`Invoice ${bill.invoice_number ?? ""} raised for ${bill.patient_name ?? "the patient"}.`);
            reload();
          }}
        />
      )}

      {paying && (
        <PaymentModal
          bill={paying}
          onClose={() => setPaying(null)}
          onSaved={(updated) => {
            setPaying(null);
            toast.success(updated.paid ? "Payment recorded. The bill is settled." : "Payment recorded.");
            reload();
          }}
        />
      )}
    </div>
  );
}

function NewBillModal({ onClose, onSaved }) {
  const [patient, setPatient] = useState(null);
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [discount, setDiscount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const total = Number(amount || 0) + Number(tax || 0) - Number(discount || 0);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!patient) return setError("Choose the patient to bill.");

    setIsSaving(true);
    try {
      const bill = await billsApi.create({
        patient: patient.value,
        amount: amount || "0",
        tax: tax || "0",
        discount: discount || "0",
        due_date: dueDate || null,
      });
      onSaved(bill);
    } catch (problem) {
      setError(apiError(problem, "Could not create that bill."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      title="New bill"
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
            {isSaving ? "Creating…" : "Create invoice"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SearchPicker label="Patient" required value={patient} onChange={setPatient} search={searchPatients} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Amount (৳)" type="number" min="0" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} />
          <Input label="Tax (৳)" type="number" min="0" step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} />
          <Input label="Discount (৳)" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} />
        </div>
        <Input label="Due date" type="date" min={localISODate()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        <div className="flex items-center justify-between rounded-xl bg-brand-50/70 px-4 py-3">
          <span className="text-sm text-ink-500">Total to pay</span>
          <span className={`text-xl font-semibold ${total < 0 ? "text-rose-600" : "text-ink-900"}`}>{money(total)}</span>
        </div>
      </div>
    </Modal>
  );
}

function PaymentModal({ bill, onClose, onSaved }) {
  const balance = Number(bill.balance ?? bill.total ?? bill.amount);
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      onSaved(await payBill(bill.id, { amount, method, reference: reference.trim() }));
    } catch (problem) {
      setError(apiError(problem, "Could not record that payment."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Take a payment"
      subtitle={`${bill.invoice_number ?? `Bill #${bill.id}`} · ${bill.patient_name ?? ""}`}
      error={error}
      busy={isSaving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="success" busy={isSaving}>
            {isSaving ? "Recording…" : `Record ${money(amount)}`}
          </Button>
        </>
      }
    >
      <dl className="mb-5 grid grid-cols-3 gap-2 text-center">
        {[
          ["Total", bill.total ?? bill.amount],
          ["Paid", bill.amount_paid],
          ["Due", balance],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-brand-50/70 px-2 py-2.5">
            <dt className="text-xs text-ink-500">{label}</dt>
            <dd className={`font-semibold ${label === "Due" ? "text-rose-600" : "text-ink-900"}`}>{money(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Amount (৳)"
          type="number"
          min="0.01"
          max={balance}
          step="0.01"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          hint={
            Number(amount) !== balance && (
              <button type="button" onClick={() => setAmount(String(balance))} className="font-medium text-brand-700 hover:underline">
                Pay the full {money(balance)}
              </button>
            )
          }
        />
        <Select label="Method" value={method} onChange={(event) => setMethod(event.target.value)}>
          {METHODS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      {method !== "cash" && (
        <div className="mt-4">
          <Input
            label="Reference"
            placeholder="Card slip, transaction or claim number"
            maxLength={100}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </div>
      )}

      {bill.payments?.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Earlier payments</p>
          <ul className="space-y-1 text-sm">
            {bill.payments.map((payment) => (
              <li key={payment.id} className="flex justify-between gap-3 text-ink-700">
                <span>
                  {formatDateTime(payment.received_at)} · <span className="capitalize">{payment.method}</span>
                </span>
                <span className="font-medium">{money(payment.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
