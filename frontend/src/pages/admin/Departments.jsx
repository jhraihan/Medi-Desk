import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { departmentsApi } from "../../api.js";
import { apiError } from "../../errors.js";
import { useToast } from "../../toast-context.js";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Pager,
  Table,
  Textarea,
} from "../../components/index.js";

export default function Departments() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, results: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const toast = useToast();

  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((c) => c + 1);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setData(await departmentsApi.listPage({ page }));
        setError("");
      } catch (problem) {
        setError(apiError(problem, "Could not load departments."));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [page, reloadCount]);

  function open(department) {
    setFormError("");
    setEditing(department);
    setName(department.name ?? "");
    setDescription(department.description ?? "");
  }

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      if (editing.id) await departmentsApi.update(editing.id, { name, description });
      else await departmentsApi.create({ name, description });
      toast.success(`Department ${name} saved.`);
      setEditing(null);
      reload();
    } catch (problem) {
      setFormError(apiError(problem, "Could not save that department."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    setIsSaving(true);
    try {
      await departmentsApi.remove(removing.id);
      toast.success(`Department ${removing.name} removed.`);
      setRemoving(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not remove that department."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="animate-fade">
      <Alert onRetry={reload}>{error}</Alert>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? `Edit ${editing.name}` : "New department"}
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
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <div className="mt-4">
          <Textarea label="Description" required value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </Modal>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">{isLoading ? "Loading..." : `${data.count} departments`}</h2>
        <Button onClick={() => open({})}>
          <Plus size={14} /> New department
        </Button>
      </div>

      {!isLoading && data.count === 0 ? (
        <EmptyState title="No departments yet" message="Add one so doctors can be placed in it." />
      ) : (
        <Table columns={["Name", "Description", ""]} isLoading={isLoading}>
          {data.results.map((department) => (
            <tr key={department.id} className="transition-colors duration-150 hover:bg-white/60">
              <td className="px-4 py-3 font-medium text-ink-900">{department.name}</td>
              <td className="px-4 py-3 text-ink-700">{department.description}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => open(department)}>
                    <Pencil size={13} /> Edit
                  </Button>
                  <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(department)}>
                    <Trash2 size={13} /> Remove
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} count={data.count} onChange={setPage} />

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.name}?`}
        message="Doctors in this department stay on record without a department."
        confirmLabel="Remove"
        workingLabel="Removing..."
        isWorking={isSaving}
        onConfirm={handleRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
