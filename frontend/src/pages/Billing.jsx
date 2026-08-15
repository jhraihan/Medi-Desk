import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { billsApi, patientsApi } from "../api.js";
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
        setError(err.message || "Failed to load billing records.");
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
      setError(err.message || "Failed to generate bill.");
    } finally {
      setIsSaving(false);
    }
  }

  async function markAsPaid(id) {
    try {
      await billsApi.patch(id, { paid: true });
      setNotice("Bill marked as paid.");
      reload();
    } catch (err) {
      setError(err.message || "Failed to update payment status.");
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
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
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

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            {isLoading ? "Loading..." : `${bills.length} Invoices`}
          </h2>
          <Button onClick={() => setFormIsOpen(true)}>
            <Plus size={14} /> Generate Bill
          </Button>
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
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              <td className="px-3 py-2 text-slate-700">{bill.id}</td>
              <td className="px-3 py-2 text-slate-700">
                Patient #{bill.patient}
              </td>
              <td className="px-3 py-2 font-medium text-slate-900">
                ${bill.amount}
              </td>
              <td className="px-3 py-2">
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
              <td className="px-3 py-2 text-slate-700">
                {new Date(bill.created_at).toLocaleDateString()}
              </td>
              <td className="px-3 py-2">
                {!bill.paid && (
                  <button
                    onClick={() => markAsPaid(bill.id)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Mark as Paid
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
