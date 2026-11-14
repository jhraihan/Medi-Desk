import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { fetchHospitalDetails, saveHospitalDetails } from "../../api.js";
import { apiError } from "../../errors.js";
import { formatDateTime } from "../../format.js";
import { useToast } from "../../toast-context.js";
import { Alert, Button, Card, Input, Loading } from "../../components/index.js";

const BLANK = { name: "", address: "", phone: "", email: "" };

export default function Hospital() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    fetchHospitalDetails()
      .then((details) => {
        setForm({ ...BLANK, ...details });
        setUpdatedAt(details.updated_at);
        setError("");
      })
      .catch((problem) => setError(apiError(problem, "Could not load the hospital details.")));
  }, [reloadCount]);

  function field(name) {
    return {
      value: form[name] ?? "",
      onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  async function handleSave(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const saved = await saveHospitalDetails({
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      });
      setForm({ ...BLANK, ...saved });
      setUpdatedAt(saved.updated_at);
      toast.success("Hospital details saved. New printouts and PDFs use them from now on.");
    } catch (problem) {
      setError(apiError(problem, "Could not save the hospital details."));
    } finally {
      setIsSaving(false);
    }
  }

  if (!form) {
    return error ? <Alert onRetry={() => setReloadCount((count) => count + 1)}>{error}</Alert> : <Loading />;
  }

  return (
    <div className="animate-fade grid gap-5 lg:grid-cols-5">
      <Card as="form" className="p-5 lg:col-span-3" onSubmit={handleSave}>
        <h2 className="font-semibold text-ink-900">Letterhead</h2>
        <p className="mt-1 text-sm text-ink-500">
          Printed at the top of every prescription, invoice and lab report, on paper and in the PDFs.
        </p>
        <Alert>{error}</Alert>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Hospital name" required maxLength={150} {...field("name")} />
          </div>
          <div className="sm:col-span-2">
            <Input label="Address" maxLength={255} {...field("address")} />
          </div>
          <Input label="Phone" maxLength={50} {...field("phone")} />
          <Input label="Email" type="email" {...field("email")} />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">{updatedAt && `Last saved ${formatDateTime(updatedAt)}`}</p>
          <Button type="submit" busy={isSaving}>
            <Save size={14} /> {isSaving ? "Saving..." : "Save details"}
          </Button>
        </div>
      </Card>

      <Card className="p-5 lg:col-span-2">
        <p className="text-xs font-semibold tracking-wider text-ink-500 uppercase">Preview</p>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-lg font-bold tracking-tight text-teal-800">{form.name || "Hospital name"}</p>
          {form.address && <p className="text-xs text-slate-600">{form.address}</p>}
          <p className="text-xs text-slate-600">{[form.phone, form.email].filter(Boolean).join(" · ")}</p>
          <div className="mt-3 border-t-2 border-teal-700" />
        </div>
      </Card>
    </div>
  );
}
