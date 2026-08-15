import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { medicinesApi } from "../api.js";
import { useFlash } from "../flash.js";
import {
  Alert,
  Button,
  IconButton,
  Input,
  PageHeader,
  Table,
  Textarea,
} from "../components/index.js";

export default function Medicines() {
  const [medicines, setMedicines] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  const [formIsOpen, setFormIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((c) => c + 1);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const data = await medicinesApi.list();
        setMedicines(data);
      } catch (err) {
        setError(err.message || "Failed to load medicines.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [reloadCount]);

  const filteredMedicines = medicines.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  async function handleSave(e) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await medicinesApi.create({ name, unit, description });
      setNotice("Medicine registered.");
      setFormIsOpen(false);
      setName("");
      setUnit("");
      setDescription("");
      reload();
    } catch (err) {
      setError(err.message || "Failed to add medicine.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Medicine Inventory"
        subtitle="Catalog and pharmacy registry."
      />

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      {/* Search Bar */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute top-2.5 left-3 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Search medicines..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-slate-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-indigo-500"
        />
      </div>

      {formIsOpen && (
        <form
          onSubmit={handleSave}
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Add Medicine
            </h2>
            <IconButton onClick={() => setFormIsOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Medicine Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Unit (e.g., mg, ml, tablet)"
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>

          <Textarea
            label="Description"
            className="mt-4"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
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
            {isLoading
              ? "Loading..."
              : `${filteredMedicines.length} Medicines listed`}
          </h2>
          <Button onClick={() => setFormIsOpen(true)}>
            <Plus size={14} /> Add Medicine
          </Button>
        </div>

        <Table columns={["ID", "Name", "Unit", "Description"]}>
          {filteredMedicines.map((m) => (
            <tr
              key={m.id}
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              <td className="px-3 py-2 text-slate-700">{m.id}</td>
              <td className="px-3 py-2 font-medium text-slate-900">{m.name}</td>
              <td className="px-3 py-2 text-slate-700">{m.unit}</td>
              <td className="px-3 py-2 text-slate-700">{m.description}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
