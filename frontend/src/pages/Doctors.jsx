import { useEffect, useState } from "react";
import { doctorsApi } from "../api.js";
import { apiError } from "../errors.js";
import { useAuth } from "../auth-context.js";
import { canWrite } from "../permissions.js";
import { useFlash } from "../flash.js";
import { Alert, PageHeader, Table } from "../components/index.js";

export default function Doctors() {
  const { user } = useAuth();
  const mayEdit = canWrite(user?.role, "doctors");

  const [doctors, setDoctors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((c) => c + 1);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const data = await doctorsApi.list();
        setDoctors(data);
      } catch (err) {
        setError(apiError(err, "Could not load doctors."));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [reloadCount]);

  async function toggleAvailability(id, currentStatus) {
    try {
      await doctorsApi.patch(id, { is_available: !currentStatus });
      setNotice("Availability status updated.");
      reload();
    } catch (err) {
      setError(apiError(err, "Could not update availability."));
    }
  }

  return (
    <div>
      <PageHeader
        title="Doctors"
        subtitle="Manage doctor profiles and availability schedules."
      />

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      <div className="animate-fade">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-ink-900">
            {isLoading ? "Loading..." : `${doctors.length} Doctors`}
          </h2>
        </div>

        <Table
          columns={[
            "ID",
            "Name",
            "Specialization",
            "Experience",
            "Phone",
            "Status",
            "Action",
          ]}
        >
          {doctors.map((doc) => (
            <tr
              key={doc.id}
              className="transition-colors duration-150 hover:bg-white/60"
            >
              <td className="px-4 py-3 text-ink-700">{doc.id}</td>
              <td className="px-4 py-3 text-ink-700">
                {doc.user_details?.first_name} {doc.user_details?.last_name}
              </td>
              <td className="px-4 py-3 text-ink-700">{doc.specialization}</td>
              <td className="px-4 py-3 text-ink-700">
                {doc.experience} years
              </td>
              <td className="px-4 py-3 text-ink-700">{doc.phone}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    doc.is_available
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {doc.is_available ? "Available" : "Off-duty"}
                </span>
              </td>
              <td className="px-4 py-3">
                {mayEdit ? (
                  <button
                    onClick={() => toggleAvailability(doc.id, doc.is_available)}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    Toggle
                  </button>
                ) : (
                  <span className="text-xs text-ink-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
