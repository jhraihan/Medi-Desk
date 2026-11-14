import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { medicinesApi } from "../api.js";
import { apiError } from "../errors.js";
import { useAuth } from "../auth-context.js";
import { canWrite } from "../permissions.js";
import { money } from "../format.js";
import { useDebounced, useLoader } from "../hooks.js";
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
  Table,
  Textarea,
} from "../components/index.js";

const BLANK = {
  name: "",
  generic_name: "",
  manufacturer: "",
  unit: "",
  unit_price: "",
  description: "",
  requires_prescription: true,
};

const STATUS_FILTERS = [
  { value: "true", label: "In use" },
  { value: "false", label: "Retired" },
  { value: "", label: "All" },
];

export default function Medicines() {
  const { user } = useAuth();
  const toast = useToast();
  const mayEdit = canWrite(user?.role, "medicines");

  const [search, setSearch] = useState("");
  const [active, setActive] = useState("true");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const settledSearch = useDebounced(search);
  const load = useCallback(() => {
    const query = { page };
    if (settledSearch) query.search = settledSearch;
    if (active) query.is_active = active;
    return medicinesApi.listPage(query);
  }, [page, settledSearch, active]);
  const { data, error, isLoading, reload } = useLoader(load, "Could not load medicines.");
  const rows = data?.results ?? [];

  function field(name) {
    return {
      value: form[name],
      onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  function openForm() {
    setForm(BLANK);
    setFormError("");
    setFormOpen(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      await medicinesApi.create({ ...form, unit_price: form.unit_price || "0" });
      toast.success(`${form.name} added to the catalogue.`);
      setFormOpen(false);
      reload();
    } catch (problem) {
      setFormError(apiError(problem, "Could not add that medicine."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Pharmacy"
        title="Medicines"
        subtitle="The catalogue doctors prescribe from."
        action={
          mayEdit && (
            <Button onClick={openForm}>
              <Plus size={15} /> Add medicine
            </Button>
          )
        }
      />

      <Card className="animate-rise mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <SearchInput
          placeholder="Search by brand, generic name or use"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          className="sm:w-96"
        />
        <Chips
          label="Status"
          options={STATUS_FILTERS}
          value={active}
          onChange={(value) => {
            setActive(value);
            setPage(1);
          }}
        />
      </Card>

      <Alert onRetry={reload}>{error}</Alert>

      <p className="mb-3 text-sm text-ink-500" aria-live="polite">
        {isLoading && !data ? "Loading…" : `${data?.count ?? 0} medicine${data?.count === 1 ? "" : "s"}`}
      </p>

      <Table
        columns={["Medicine", "Unit", "Price", "Description", ""]}
        isLoading={isLoading}
        empty={search ? "No medicines match that search." : "The catalogue is empty."}
      >
        {rows.map((medicine) => (
          <tr key={medicine.id} className="transition-colors duration-150 hover:bg-white/60">
            <td className="px-4 py-3">
              <p className="font-medium text-ink-900">{medicine.name}</p>
              {(medicine.generic_name || medicine.manufacturer) && (
                <p className="text-xs text-ink-500">
                  {[medicine.generic_name, medicine.manufacturer].filter(Boolean).join(" · ")}
                </p>
              )}
            </td>
            <td className="px-4 py-3 text-ink-700">{medicine.unit}</td>
            <td className="px-4 py-3 whitespace-nowrap text-ink-700">{money(medicine.unit_price)}</td>
            <td className="max-w-md px-4 py-3 text-ink-700">
              <p className="line-clamp-2">{medicine.description || "—"}</p>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap justify-end gap-1">
                {medicine.requires_prescription && <Badge tone="brand">Rx</Badge>}
                {!medicine.is_active && <Badge>retired</Badge>}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} count={data?.count ?? 0} onChange={setPage} />

      <Modal
        open={formOpen}
        size="lg"
        title="Add a medicine"
        error={formError}
        busy={isSaving}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSave}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" busy={isSaving}>
              {isSaving ? "Saving…" : "Add medicine"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Brand name" required placeholder="Napa" {...field("name")} />
          <Input label="Generic name" placeholder="Paracetamol" {...field("generic_name")} />
          <Input label="Unit" required placeholder="500 mg tablet" {...field("unit")} />
          <Input label="Price per unit (৳)" type="number" min="0" step="0.01" {...field("unit_price")} />
          <Input label="Manufacturer" {...field("manufacturer")} />
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.requires_prescription}
              onChange={(event) => setForm((current) => ({ ...current, requires_prescription: event.target.checked }))}
              className="h-4 w-4 rounded accent-brand-600"
            />
            Needs a prescription
          </label>
        </div>
        <div className="mt-4">
          <Textarea label="What it's for" rows={2} {...field("description")} />
        </div>
      </Modal>
    </div>
  );
}
