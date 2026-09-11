import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BadgeDollarSign,
  CalendarCheck,
  ClipboardList,
  Clock,
  Package,
  Receipt,
  Stethoscope,
  Users,
} from "lucide-react";
import { fetchDashboard } from "../api.js";
import { useAuth } from "../auth-context.js";
import { Alert, Card, PageHeader, StatTile } from "../components/index.js";

const TILES = {
  today_appointments: { label: "Appointments today", icon: CalendarCheck },
  pending_approvals: { label: "Awaiting approval", icon: ClipboardList },
  patients_seen_this_week: { label: "Seen this week", icon: Stethoscope },
  prescriptions_issued: { label: "Prescriptions issued", icon: ClipboardList },
  next_appointment: { label: "Next appointment", icon: CalendarCheck },
  active_prescriptions: { label: "Active prescriptions", icon: ClipboardList },
  outstanding_balance: { label: "Outstanding balance", icon: Receipt },
  today_queue: { label: "In today's queue", icon: Clock },
  unconfirmed: { label: "Unconfirmed bookings", icon: ClipboardList },
  unpaid_invoices: { label: "Unpaid invoices", icon: Receipt },
  revenue_this_month: { label: "Revenue this month", icon: BadgeDollarSign },
  outstanding_invoices: { label: "Outstanding invoices", icon: Receipt },
  active_doctors: { label: "Doctors available", icon: Stethoscope },
  total_patients: { label: "Patients", icon: Users },
  low_stock: { label: "Low on stock", icon: Package },
  medicines: { label: "Medicines listed", icon: Package },
  expiring_soon: { label: "Expiring soon", icon: Package },
};

const MONEY = ["revenue_this_month", "outstanding_balance"];

function format(key, value) {
  if (value === null || value === undefined) return "—";
  if (key === "next_appointment") return new Date(value).toLocaleString();
  if (MONEY.includes(key)) return `৳${Number(value).toLocaleString()}`;
  return value;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchDashboard()
      .then((result) => active && setData(result))
      .catch(() => active && setError("Could not load your overview."));
    return () => {
      active = false;
    };
  }, []);

  const { role, ...stats } = data ?? {};
  const tiles = Object.entries(stats).filter(([key]) => key !== "appointments_by_status");
  const byStatus = stats.appointments_by_status ?? [];
  const peak = Math.max(1, ...byStatus.map((row) => row.count));

  return (
    <>
      <PageHeader
        eyebrow={role ? `Signed in as ${role}` : "Loading"}
        title={`Welcome back, ${user?.first_name || user?.username || ""}`}
        subtitle="Here is how things look today."
      />

      <Alert>{error}</Alert>

      {!data && !error && <p className="text-sm text-ink-500">Loading your overview…</p>}

      {data && (
        <>
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map(([key, value]) => {
              const meta = TILES[key] ?? { label: key.replaceAll("_", " ") };
              const alarming = key === "low_stock" && Number(value) > 0;
              return (
                <StatTile
                  key={key}
                  label={meta.label}
                  value={format(key, value)}
                  icon={meta.icon}
                  tone={alarming ? "tinted" : "glass"}
                />
              );
            })}
          </div>

          {byStatus.length > 0 && (
            <Card className="animate-rise mt-6 p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="rounded-xl bg-brand-50 p-2 text-brand-600">
                  <Activity size={16} />
                </span>
                <h2 className="font-semibold text-ink-900">Appointments by status</h2>
              </div>

              <div className="space-y-3">
                {byStatus.map((row) => (
                  <div key={row.status} className="flex items-center gap-3">
                    <span className="w-32 text-xs capitalize text-ink-500">
                      {row.status.replaceAll("_", " ")}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-brand-100/70">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all duration-700"
                        style={{ width: `${(row.count / peak) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs font-semibold text-ink-700">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {role === "patient" && (
            <Card tone="tinted" className="animate-rise mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="text-lg font-semibold">Waiting to be seen today?</p>
                <p className="text-sm text-white/75">
                  Check your live position and estimated waiting time.
                </p>
              </div>
              <Link
                to="/my-queue"
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-brand-700 transition-transform duration-200 hover:scale-[1.02]"
              >
                View my queue
              </Link>
            </Card>
          )}
        </>
      )}
    </>
  );
}
