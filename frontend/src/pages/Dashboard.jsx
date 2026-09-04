import { useEffect, useState } from "react";
import { fetchDashboard } from "../api.js";
import { Alert, PageHeader } from "../components/index.js";
import { useAuth } from "../auth-context.js";

const LABELS = {
  today_appointments: "Appointments today",
  pending_approvals: "Awaiting approval",
  patients_seen_this_week: "Seen this week",
  prescriptions_issued: "Prescriptions issued",
  next_appointment: "Next appointment",
  active_prescriptions: "Active prescriptions",
  outstanding_balance: "Outstanding balance",
  today_queue: "In today's queue",
  unconfirmed: "Unconfirmed bookings",
  unpaid_invoices: "Unpaid invoices",
  revenue_this_month: "Revenue this month",
  outstanding_invoices: "Outstanding invoices",
  active_doctors: "Doctors available",
  total_patients: "Patients",
  low_stock: "Medicines low on stock",
  medicines: "Medicines listed",
  expiring_soon: "Batches expiring soon",
};

const MONEY = new Set(["revenue_this_month", "outstanding_balance"]);

function format(key, value) {
  if (value === null || value === undefined) return "—";
  if (key === "next_appointment") return new Date(value).toLocaleString();
  if (MONEY.has(key)) return `$${Number(value).toFixed(2)}`;
  return value;
}

function Stat({ label, value, highlight }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${highlight ? "text-amber-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchDashboard()
      .then((result) => active && setData(result))
      .catch(() => active && setError("Could not load the dashboard."));
    return () => {
      active = false;
    };
  }, []);

  const { role, ...stats } = data ?? {};
  const entries = Object.entries(stats).filter(([key]) => key !== "appointments_by_status");
  const byStatus = stats.appointments_by_status ?? [];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.first_name || user?.username || ""}`}
        subtitle={role ? `Signed in as ${role}. Here's today at a glance.` : "Loading your overview."}
      />

      <Alert>{error}</Alert>

      {!data && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {entries.map(([key, value]) => (
              <Stat
                key={key}
                label={LABELS[key] ?? key.replaceAll("_", " ")}
                value={format(key, value)}
                highlight={key === "low_stock" && Number(value) > 0}
              />
            ))}
          </div>

          {byStatus.length > 0 && (
            <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Appointments by status</h2>
              <div className="space-y-2">
                {byStatus.map((row) => (
                  <div key={row.status} className="flex items-center gap-3">
                    <span className="w-24 text-xs capitalize text-slate-500">{row.status}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{
                          width: `${(row.count / Math.max(...byStatus.map((r) => r.count))) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs font-medium text-slate-700">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
