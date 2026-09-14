import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { billsApi, openInvoice, patientsApi, payBill } from "../api.js";
import { apiError } from "../errors.js";
import { useAuth } from "../auth-context.js";
import { canWrite } from "../permissions.js";
import { useFlash } from "../flash.js";
import {
  Alert,
  Button,
  IconButton,
  Input,
  PageHeader,
  Select,
  Table,
} from "../components/index.js";

export default function Billing() {
  const { user } = useAuth();
  const mayEdit = canWrite(user?.role, "bills");

  const [bills, setBills] = useState([]);
  const [patients, setPatients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  const [formIsOpen, setFormIsOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [amount, setAmount] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((c) => c + 1);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const [billRes, patRes] = await Promise.all([
          billsApi.list(),
          patientsApi.list(),
        ]);
        setBills(billRes);
        setPatients(patRes);
      } catch (err) {
        setError(apiError(err, "Could not load billing."));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [reloadCount]);

  async function handleCreate(e) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await billsApi.create({
        patient: Number(patientId),
        amount: Number(amount),
        paid: false,
      });
      setNotice("Bill generated successfully.");
      setFormIsOpen(false);
      setPatientId("");
      setAmount("");
      reload();
    } catch (err) {
      setError(apiError(err, "Could not create that bill."));
    } finally {
      setIsSaving(false);
    }
  }

  async function settle(bill) {
    const outstanding = bill.balance ?? bill.amount;
    const entered = window.prompt(
      `Amount to record against ${bill.invoice_number ?? `bill #${bill.id}`} (outstanding ${outstanding})`,
      outstanding,
    );
    if (entered === null) return;

    try {
      await payBill(bill.id, { amount: entered, method: "cash" });
      setNotice("Payment recorded.");
      reload();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to record the payment.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Billing & Invoicing"
        subtitle="Generate patient invoices and track payments."
      />

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      {formIsOpen && (
        <form
          onSubmit={handleCreate}
          className="animate-rise glass-strong mb-5 rounded-2xl p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">
              Generate New Bill
            </h2>
            <IconButton onClick={() => setFormIsOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Patient"
              placeholder="Select Patient..."
              required
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.user_details?.first_name} {p.user_details?.last_name}
                </option>
              ))}
            </Select>

            <Input
              label="Amount ($)"
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Generating..." : "Create Invoice"}
            </Button>
            <Button variant="secondary" onClick={() => setFormIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="animate-fade">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink-900">
            {isLoading ? "Loading..." : `${bills.length} Invoices`}
          </h2>
          {mayEdit && (
            <Button onClick={() => setFormIsOpen(true)}>
              <Plus size={14} /> Generate Bill
            </Button>
          )}
        </div>

        <Table
          columns={[
            "ID",
            "Patient",
            "Amount",
            "Status",
            "Issued Date",
            "Action",
          ]}
        >
          {bills.map((bill) => (
            <tr
              key={bill.id}
              className="transition-colors duration-150 hover:bg-white/60"
            >
              <td className="px-4 py-3 text-ink-700">{bill.id}</td>
              <td className="px-4 py-3 text-ink-700">
                Patient #{bill.patient}
              </td>
              <td className="px-4 py-3 font-medium text-ink-900">
                ${bill.total ?? bill.amount}
                {bill.balance != null && Number(bill.balance) > 0 && (
                  <span className="ml-1 text-xs font-normal text-rose-600">
                    ({bill.balance} due)
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    bill.paid
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {bill.paid ? "Paid" : "Unpaid"}
                </span>
              </td>
              <td className="px-4 py-3 text-ink-700">
                {new Date(bill.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-3">
                  {mayEdit && !bill.paid && (
                    <button
                      onClick={() => settle(bill)}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      Record payment
                    </button>
                  )}
                  <button
                    onClick={() => openInvoice(bill.id)}
                    className="text-xs font-medium text-ink-500 hover:underline"
                  >
                    Invoice
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
