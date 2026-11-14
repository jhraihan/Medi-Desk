import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { labTestsApi } from "../../api.js";
import { apiError } from "../../errors.js";
import { money } from "../../format.js";
import { useToast } from "../../toast-context.js";
import { Alert, Badge, Button, DeleteRecordButton, Input, Modal, Pager, Select, Table } from "../../components/index.js";

const CATEGORIES = [
  { value: "blood", label: "Blood" },
  { value: "urine", label: "Urine & stool" },
  { value: "imaging", label: "Imaging" },
  { value: "cardiac", label: "Cardiac" },
  { value: "other", label: "Other" },
];

const EMPTY = { name: "", category: "blood", price: "", description: "", is_active: true };

export default function LabTestCatalog() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, results: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((count) => count + 1);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setData(await labTestsApi.listPage({ page, ordering: "name" }));
        setError("");
      } catch (problem) {
        setError(apiError(problem, "Could not load the test catalogue."));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [page, reloadCount]);

  function open(test) {
    setFormError("");
    setEditing(test);
    setForm(test.id ? { ...EMPTY, ...test } : EMPTY);
  }

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      category: form.category,
      price: form.price || "0",
      description: form.description.trim(),
      is_active: form.is_active,
    };
    try {
      if (editing.id) await labTestsApi.update(editing.id, payload);
      else await labTestsApi.create(payload);
      toast.success(`${payload.name} saved.`);
      setEditing(null);
      reload();
    } catch (problem) {
      setFormError(apiError(problem, "Could not save that test."));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggle(test) {
    try {
      await labTestsApi.patch(test.id, { is_active: !test.is_active });
      toast.success(`${test.name} ${test.is_active ? "retired" : "offered again"}.`);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not change that test."));
    }
  }

  return (
    <div className="animate-fade">
      <Alert onRetry={reload}>{error}</Alert>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? `Edit ${editing.name}` : "New lab test"}
        subtitle="Doctors order from this list, and the price goes on the patient's bill."
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
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Name" required maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
          <Input
            label="Price (৳)"
            type="number"
            min="0"
            step="0.01"
            required
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Input
              label="Description"
              maxLength={255}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">{isLoading ? "Loading..." : `${data.count} tests in the catalogue`}</h2>
        <Button onClick={() => open({})}>
          <Plus size={14} /> New test
        </Button>
      </div>

      <Table columns={["Test", "Category", "Price", "Status", ""]} isLoading={isLoading} empty="No tests in the catalogue yet.">
        {data.results.map((test) => (
          <tr key={test.id} className="transition-colors duration-150 hover:bg-white/60">
            <td className="px-4 py-3">
              <p className="font-medium text-ink-900">{test.name}</p>
              {test.description && <p className="text-xs text-ink-500">{test.description}</p>}
            </td>
            <td className="px-4 py-3 text-ink-700">{test.category_display}</td>
            <td className="px-4 py-3 font-medium text-ink-900">{money(test.price)}</td>
            <td className="px-4 py-3">
              <Badge tone={test.is_active ? "success" : "neutral"}>{test.is_active ? "offered" : "retired"}</Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => open(test)}>
                  <Pencil size={13} /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(test)}>
                  {test.is_active ? "Retire" : "Offer again"}
                </Button>
                <DeleteRecordButton
                  title={`Delete ${test.name}?`}
                  message="Only a test that has never been ordered can be deleted. One with past orders is kept for its results; retire it instead."
                  success={`${test.name} deleted.`}
                  onDelete={() => labTestsApi.remove(test.id)}
                  onDeleted={reload}
                />
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} count={data.count} onChange={setPage} />
    </div>
  );
}
