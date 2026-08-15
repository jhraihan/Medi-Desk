import { useEffect, useState } from "react";
import { doctorsApi } from "../api.js";
import { useFlash } from "../flash.js";
import { Alert, PageHeader, Table } from "../components/index.js";

export default function Doctors() {
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
        setError(err.message || "Failed to load doctors.");
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
      setError(err.message || "Failed to update availability.");
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

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
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
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              <td className="px-3 py-2 text-slate-700">{doc.id}</td>
              <td className="px-3 py-2 text-slate-700">
                {doc.user_details?.first_name} {doc.user_details?.last_name}
              </td>
              <td className="px-3 py-2 text-slate-700">{doc.specialization}</td>
              <td className="px-3 py-2 text-slate-700">
                {doc.experience} years
              </td>
              <td className="px-3 py-2 text-slate-700">{doc.phone}</td>
              <td className="px-3 py-2">
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
              <td className="px-3 py-2">
                <button
                  onClick={() => toggleAvailability(doc.id, doc.is_available)}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Toggle
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
