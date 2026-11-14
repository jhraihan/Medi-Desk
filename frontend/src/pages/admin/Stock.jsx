import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { medicineStockApi, medicinesApi } from "../../api.js";
import { apiError } from "../../errors.js";
import { formatDate, money } from "../../format.js";
import { useToast } from "../../toast-context.js";
import {
  Alert,
  Badge,
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

const EMPTY = {
  medicine: "",
  batch_number: "",
  quantity: "",
  reorder_level: "10",
  expiry_date: "",
  purchase_price: "",
};

export default function Stock() {
  const [medicines, setMedicines] = useState([]);
  const [medicineFilter, setMedicineFilter] = useState("");
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
    medicinesApi.listAll().then(setMedicines).catch(() => setMedicines([]));
  }, [reloadCount]);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const params = { page, ordering: "expiry_date" };
        if (medicineFilter) params.medicine = medicineFilter;
        setData(await medicineStockApi.listPage(params));
        setError("");
      } catch (problem) {
        setError(apiError(problem, "Could not load stock."));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [page, medicineFilter, reloadCount]);

  function open(batch) {
    setFormError("");
    setEditing(batch);
    setForm(
      batch.id
        ? {
            medicine: String(batch.medicine),
            batch_number: batch.batch_number,
            quantity: String(batch.quantity),
            reorder_level: String(batch.reorder_level),
            expiry_date: batch.expiry_date,
            purchase_price: batch.purchase_price,
          }
        : { ...EMPTY, medicine: medicineFilter },
    );
  }

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        medicine: Number(form.medicine),
        quantity: Number(form.quantity),
        reorder_level: Number(form.reorder_level),
        purchase_price: form.purchase_price || "0",
      };
      if (editing.id) await medicineStockApi.update(editing.id, payload);
      else await medicineStockApi.create(payload);
      toast.success(`Batch ${form.batch_number} saved.`);
      setEditing(null);
      reload();
    } catch (problem) {
      setFormError(apiError(problem, "Could not save that batch."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    setIsSaving(true);
    try {
      await medicineStockApi.remove(removing.id);
      toast.success(`Batch ${removing.batch_number} removed.`);
      setRemoving(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not remove that batch."));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleMedicine(medicine) {
    try {
      await medicinesApi.patch(medicine.id, { is_active: !medicine.is_active });
      toast.success(`${medicine.name} ${medicine.is_active ? "retired from" : "returned to"} the catalogue.`);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not change that medicine."));
    }
  }

  return (
    <div className="animate-fade">
      <Alert onRetry={reload}>{error}</Alert>

      <Card className="mb-5 p-5 sm:max-w-md">
        <Select
          label="Medicine"
          placeholder="All medicines"
          value={medicineFilter}
          onChange={(e) => {
            setMedicineFilter(e.target.value);
            setPage(1);
          }}
        >
          {medicines.map((medicine) => (
            <option key={medicine.id} value={medicine.id}>
              {medicine.name}
            </option>
          ))}
        </Select>
      </Card>

      <Modal
        open={Boolean(editing)}
        size="lg"
        title={editing?.id ? `Edit batch ${editing.batch_number}` : "Receive a batch"}
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
              {isSaving ? "Saving..." : "Save batch"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Medicine"
            placeholder="Select medicine"
            required
            value={form.medicine}
            onChange={(e) => setForm({ ...form, medicine: e.target.value })}
          >
            {medicines.map((medicine) => (
              <option key={medicine.id} value={medicine.id}>
                {medicine.name}
              </option>
            ))}
          </Select>
          <Input
            label="Batch number"
            required
            value={form.batch_number}
            onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
          />
          <Input
            label="Quantity"
            type="number"
            min="0"
            required
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <Input
            label="Reorder at"
            type="number"
            min="0"
            required
            value={form.reorder_level}
            onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
          />
          <Input
            label="Expiry date"
            type="date"
            required
            value={form.expiry_date}
            onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
          />
          <Input
            label="Purchase price (per unit)"
            type="number"
            min="0"
            step="0.01"
            value={form.purchase_price}
            onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
          />
        </div>
      </Modal>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">{isLoading ? "Loading..." : `${data.count} batches`}</h2>
        <Button onClick={() => open({})}>
          <Plus size={14} /> Receive batch
        </Button>
      </div>

      {!isLoading && data.count === 0 ? (
        <EmptyState title="No stock recorded" message="Batches received here are what the pharmacy dispenses from." />
      ) : (
        <Table columns={["Medicine", "Batch", "Quantity", "Expiry", "Status", ""]} isLoading={isLoading}>
          {data.results.map((batch) => (
            <tr key={batch.id} className="transition-colors duration-150 hover:bg-white/60">
              <td className="px-4 py-3 font-medium text-ink-900">{batch.medicine_name}</td>
              <td className="px-4 py-3 text-ink-700">{batch.batch_number}</td>
              <td className="px-4 py-3 text-ink-700">
                {batch.quantity} <span className="text-xs text-ink-400">(reorder at {batch.reorder_level})</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-ink-700">{formatDate(batch.expiry_date)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {batch.is_expired && <Badge tone="danger">expired</Badge>}
                  {batch.needs_reorder && <Badge tone="warning">reorder</Badge>}
                  {!batch.is_expired && !batch.needs_reorder && <Badge tone="success">ok</Badge>}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => open(batch)}>
                    <Pencil size={13} /> Edit
                  </Button>
                  <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(batch)}>
                    <Trash2 size={13} /> Remove
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} count={data.count} onChange={setPage} />

      <h2 className="mt-8 mb-3 font-semibold text-ink-900">Medicine catalogue</h2>
      <p className="mb-3 text-sm text-ink-500">
        Retire a medicine instead of deleting it: deleting removes it from every prescription that lists it.
      </p>
      <Table columns={["Medicine", "Unit", "Price", "Status", "Actions"]}>
        {medicines.map((medicine) => (
          <tr key={medicine.id} className="transition-colors duration-150 hover:bg-white/60">
            <td className="px-4 py-3 font-medium text-ink-900">
              {medicine.name}
              {medicine.generic_name && <span className="block text-xs text-ink-500">{medicine.generic_name}</span>}
            </td>
            <td className="px-4 py-3 text-ink-700">{medicine.unit}</td>
            <td className="px-4 py-3 text-ink-700">{money(medicine.unit_price)}</td>
            <td className="px-4 py-3">
              <Badge tone={medicine.is_active ? "success" : "neutral"}>
                {medicine.is_active ? "active" : "retired"}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <Button size="sm" variant={medicine.is_active ? "ghost" : "secondary"} onClick={() => toggleMedicine(medicine)}>
                {medicine.is_active ? "Retire" : "Reinstate"}
              </Button>
            </td>
          </tr>
        ))}
      </Table>

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove batch ${removing?.batch_number}?`}
        message="Use this for a batch entered by mistake. For stock that was used or discarded, set the quantity instead."
        confirmLabel="Remove"
        workingLabel="Removing..."
        isWorking={isSaving}
        onConfirm={handleRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
