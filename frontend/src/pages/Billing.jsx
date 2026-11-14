import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListPlus, Pencil, Plus, Printer, Trash2, Wallet } from "lucide-react";
import { addBillItem, billsApi, openPrintable, payBill, removeBillItem } from "../api.js";
import { apiError } from "../errors.js";
import { useAuth } from "../auth-context.js";
import { canWrite } from "../permissions.js";
import { formatDate, formatDateTime, localISODate, money } from "../format.js";
import { useDebounced, useLoader } from "../hooks.js";
import { searchLabTests, searchMedicines, searchPatients } from "../pickers.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chips,
  DeleteRecordButton,
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
} from "../components/index.js";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
];

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "mobile", label: "Mobile banking (bKash, Nagad)" },
  { value: "transfer", label: "Bank transfer" },
  { value: "insurance", label: "Insurance" },
];

const SERVICE_TYPES = [
  { value: "consultation", label: "Consultation" },
  { value: "medicine", label: "Medicine" },
  { value: "lab", label: "Lab test" },
  { value: "procedure", label: "Procedure" },
  { value: "room", label: "Room / bed" },
];

let nextLineKey = 1;
function blankLine(type = "consultation") {
  return { key: nextLineKey++, service_type: type, description: "", quantity: "1", unit_price: "", pick: null };
}

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
  const load = useCallback(() => {
    const query = { page };
    if (status) query.paid = status === "paid";
    if (settledSearch) query.search = settledSearch;
    return billsApi.listPage(query);
  }, [page, status, settledSearch]);
  const { data, error, isLoading, reload } = useLoader(load, "Could not load bills.");
  const rows = data?.results ?? [];

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
                  <Button size="sm" variant="ghost" onClick={() => setViewing(bill)}>
                    <ListPlus size={13} /> Items ({bill.items?.length ?? 0})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openPrintable(`/print/bill/${bill.id}`)}>
                    <Printer size={13} /> Print
                  </Button>
                  <DownloadPdfButton path={`bills/${bill.id}/pdf/`} filename={`invoice-${bill.invoice_number}.pdf`} />
                  {user?.role === "admin" && (
                    <DeleteRecordButton
                      title={`Delete ${bill.invoice_number ?? "this bill"}?`}
                      message={
                        Number(bill.amount_paid) > 0
                          ? `${money(bill.amount_paid)} has been paid on this bill. Deleting it also deletes those payment records. This cannot be undone.`
                          : "The bill and its lines are removed. This cannot be undone."
                      }
                      success="Bill deleted."
                      onDelete={() => billsApi.remove(bill.id)}
                      onDeleted={reload}
                    />
                  )}
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
          onSaved={(bill, print) => {
            setCreating(false);
            toast.success(`Invoice ${bill.invoice_number ?? ""} raised for ${bill.patient_name ?? "the patient"}.`);
            if (print) openPrintable(`/print/bill/${bill.id}`);
            reload();
          }}
        />
      )}

      {viewing && (
        <BillItemsModal
          bill={viewing}
          canEdit={mayEdit}
          onClose={() => setViewing(null)}
          onChanged={(updated) => {
            setViewing(updated);
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

// One row of a bill. Medicines and lab tests are picked from the catalogue, which
// fills in the name and price; anything else is typed in.
function LineEditor({ line, onChange, onRemove }) {
  const picker =
    line.service_type === "medicine" ? searchMedicines : line.service_type === "lab" ? searchLabTests : null;

  return (
    <div className="grid items-end gap-3 rounded-xl bg-brand-50/50 p-3 sm:grid-cols-[1.2fr_2.6fr_0.7fr_1fr_auto]">
      <Select
        label="Type"
        value={line.service_type}
        onChange={(event) => onChange({ service_type: event.target.value, pick: null })}
      >
        {SERVICE_TYPES.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </Select>
      {picker ? (
        <SearchPicker
          label={line.service_type === "medicine" ? "Medicine" : "Test"}
          required
          value={line.pick}
          search={picker}
          onChange={(pick) =>
            onChange({
              pick,
              description: pick ? (pick.unit ? `${pick.label} (${pick.unit})` : pick.label) : "",
              unit_price: pick?.price ?? "",
            })
          }
        />
      ) : (
        <Input
          label="Description"
          required
          maxLength={255}
          placeholder={line.service_type === "consultation" ? "Consultation fee" : "Dressing, bed charge…"}
          value={line.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      )}
      <Input
        label="Qty"
        type="number"
        min="1"
        required
        value={line.quantity}
        onChange={(event) => onChange({ quantity: event.target.value })}
      />
      <Input
        label="Price (৳)"
        type="number"
        min="0"
        step="0.01"
        required
        value={line.unit_price}
        onChange={(event) => onChange({ unit_price: event.target.value })}
      />
      <IconButton variant="danger" label="Remove this line" onClick={onRemove}>
        <Trash2 size={15} />
      </IconButton>
    </div>
  );
}

function lineTotal(line) {
  return (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
}

function NewBillModal({ onClose, onSaved }) {
  const [patient, setPatient] = useState(null);
  const [lines, setLines] = useState(() => [blankLine()]);
  const [tax, setTax] = useState("");
  const [discount, setDiscount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [printAfter, setPrintAfter] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const total = subtotal + Number(tax || 0) - Number(discount || 0);

  function update(key, changes) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...changes } : line)));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!patient) return setError("Choose the patient to bill.");
    if (lines.length === 0) return setError("Add at least one line to the bill.");
    if (lines.some((line) => !line.description.trim())) return setError("Every line needs a description.");

    setIsSaving(true);
    try {
      const bill = await billsApi.create({
        patient: patient.value,
        line_items: lines.map((line) => ({
          service_type: line.service_type,
          description: line.description.trim(),
          quantity: Number(line.quantity) || 1,
          unit_price: line.unit_price || "0",
        })),
        tax: tax || "0",
        discount: discount || "0",
        due_date: dueDate || null,
      });
      onSaved(bill, printAfter);
    } catch (problem) {
      setError(apiError(problem, "Could not create that bill."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      size="xl"
      title="New bill"
      subtitle="Add each service, medicine or test. Medicines and tests come with their catalogue price."
      error={error}
      busy={isSaving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={printAfter} onChange={(event) => setPrintAfter(event.target.checked)} />
            Print after saving
          </label>
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

        <div className="space-y-3">
          {lines.map((line) => (
            <LineEditor
              key={line.key}
              line={line}
              onChange={(changes) => update(line.key, changes)}
              onRemove={() => setLines((current) => current.filter((row) => row.key !== line.key))}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {SERVICE_TYPES.slice(0, 3).map((type) => (
            <Button
              key={type.value}
              variant="secondary"
              size="sm"
              onClick={() => setLines((current) => [...current, blankLine(type.value)])}
            >
              <Plus size={14} /> {type.label}
            </Button>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setLines((current) => [...current, blankLine("procedure")])}>
            <Plus size={14} /> Other
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="VAT / tax (৳)" type="number" min="0" step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} />
          <Input label="Discount (৳)" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} />
          <Input label="Due date" type="date" min={localISODate()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>

        <dl className="space-y-1 rounded-xl bg-brand-50/70 px-4 py-3 text-sm">
          <div className="flex justify-between text-ink-500">
            <dt>Subtotal</dt>
            <dd>{money(subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-ink-500">Total to pay</dt>
            <dd className={`text-xl font-semibold ${total < 0 ? "text-rose-600" : "text-ink-900"}`}>{money(total)}</dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}

function BillItemsModal({ bill, canEdit, onClose, onChanged }) {
  const toast = useToast();
  const [adding, setAdding] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  // null = closed, otherwise the VAT, discount and due date being edited
  const [adjusting, setAdjusting] = useState(null);
  const items = bill.items ?? [];

  async function saveAdjustment() {
    setError("");
    setBusyId("adjust");
    try {
      onChanged(
        await billsApi.patch(bill.id, {
          tax: adjusting.tax || "0",
          discount: adjusting.discount || "0",
          due_date: adjusting.due_date || null,
        }),
      );
      toast.success("Bill totals updated.");
      setAdjusting(null);
    } catch (problem) {
      setError(apiError(problem, "Could not update the bill."));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item) {
    setError("");
    setBusyId(item.id);
    try {
      onChanged(await removeBillItem(bill.id, item.id));
      toast.success(`${item.description} removed from the bill.`);
    } catch (problem) {
      setError(apiError(problem, "Could not remove that line."));
    } finally {
      setBusyId(null);
    }
  }

  async function add(event) {
    event.preventDefault();
    setError("");
    if (!adding.description.trim()) return setError("The new line needs a description.");
    setBusyId("new");
    try {
      onChanged(
        await addBillItem(bill.id, {
          service_type: adding.service_type,
          description: adding.description.trim(),
          quantity: Number(adding.quantity) || 1,
          unit_price: adding.unit_price || "0",
        }),
      );
      toast.success(`${adding.description.trim()} added to the bill.`);
      setAdding(null);
    } catch (problem) {
      setError(apiError(problem, "Could not add that line."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal
      open
      size="xl"
      title={`${bill.invoice_number ?? `Bill #${bill.id}`} · ${bill.patient_name ?? ""}`}
      subtitle={bill.doctor_name ? `Visit with ${bill.doctor_name}` : "Itemised charges"}
      error={error}
      onClose={onClose}
      onSubmit={adding ? add : undefined}
      footer={
        <>
          {canEdit && !adding && (
            <Button variant="secondary" className="mr-auto" onClick={() => setAdding(blankLine("procedure"))}>
              <Plus size={14} /> Add a line
            </Button>
          )}
          {adding && (
            <Button type="submit" className="mr-auto" busy={busyId === "new"}>
              Add to bill
            </Button>
          )}
          <DownloadPdfButton
            path={`bills/${bill.id}/pdf/`}
            filename={`invoice-${bill.invoice_number}.pdf`}
            label="PDF"
            variant="secondary"
            size="md"
          />
          <Button variant="secondary" onClick={() => openPrintable(`/print/bill/${bill.id}`)}>
            <Printer size={14} /> Print
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-brand-100 text-sm">
        {items.length === 0 && <li className="py-3 text-ink-500">No itemised lines on this bill.</li>}
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="font-medium text-ink-900">{item.description}</p>
              <p className="text-xs text-ink-500">
                <span className="capitalize">{item.service_type}</span> · {item.quantity} × {money(item.unit_price)}
                {item.generated && " · from the prescription"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium whitespace-nowrap text-ink-900">{money(item.line_total)}</span>
              {canEdit && (
                <IconButton
                  variant="danger"
                  label={`Remove ${item.description}`}
                  disabled={busyId === item.id}
                  onClick={() => remove(item)}
                >
                  <Trash2 size={15} />
                </IconButton>
              )}
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-4">
          <LineEditor line={adding} onChange={(changes) => setAdding((line) => ({ ...line, ...changes }))} onRemove={() => setAdding(null)} />
        </div>
      )}

      {canEdit && !adjusting && (
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setAdjusting({ tax: bill.tax ?? "", discount: bill.discount ?? "", due_date: bill.due_date ?? "" })
            }
          >
            <Pencil size={13} /> Change VAT, discount or due date
          </Button>
        </div>
      )}
      {adjusting && (
        <div className="mt-4 grid gap-3 rounded-xl border border-brand-100 bg-white/70 p-4 sm:grid-cols-4 sm:items-end">
          <Input
            label="VAT / tax (৳)"
            type="number"
            min="0"
            step="0.01"
            value={adjusting.tax}
            onChange={(event) => setAdjusting((current) => ({ ...current, tax: event.target.value }))}
          />
          <Input
            label="Discount (৳)"
            type="number"
            min="0"
            step="0.01"
            value={adjusting.discount}
            onChange={(event) => setAdjusting((current) => ({ ...current, discount: event.target.value }))}
          />
          <Input
            label="Due date"
            type="date"
            value={adjusting.due_date}
            onChange={(event) => setAdjusting((current) => ({ ...current, due_date: event.target.value }))}
          />
          <div className="flex gap-2">
            <Button size="sm" busy={busyId === "adjust"} onClick={saveAdjustment}>
              Save
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAdjusting(null)} disabled={busyId === "adjust"}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <dl className="mt-4 space-y-1 rounded-xl bg-brand-50/70 px-4 py-3 text-sm">
        {[
          ["Subtotal", bill.amount],
          Number(bill.tax) > 0 && ["VAT / tax", bill.tax],
          Number(bill.discount) > 0 && ["Discount", -Number(bill.discount)],
          ["Total", bill.total],
          ["Paid", bill.amount_paid],
          ["Balance due", bill.balance],
        ]
          .filter(Boolean)
          .map(([label, value]) => (
            <div key={label} className={`flex justify-between ${label === "Total" ? "font-semibold text-ink-900" : "text-ink-700"}`}>
              <dt>{label}</dt>
              <dd>{money(value)}</dd>
            </div>
          ))}
      </dl>
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
