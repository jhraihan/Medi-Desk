import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeDollarSign,
  CalendarCheck,
  Droplet,
  ExternalLink,
  Package,
  Receipt,
  Stethoscope,
  Users,
} from "lucide-react";
import { fetchAdminOverview } from "../../api.js";
import { apiError } from "../../errors.js";
import { Alert, Badge, Card, Loading, StatTile, Table } from "../../components/index.js";
import { ACTION_TONES, describeChange } from "./audit-format.js";

const ROLE_LABELS = {
  admin: "Admins",
  doctor: "Doctors",
  receptionist: "Receptionists",
  pharmacist: "Pharmacists",
  patient: "Patients",
};

function money(value) {
  return `৳${Number(value ?? 0).toLocaleString()}`;
}

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setData(await fetchAdminOverview());
      } catch (problem) {
        setError(apiError(problem, "Could not load the overview."));
      }
    }
    load();
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading message="Gathering hospital figures…" />;

  const { users, clinic, appointments, billing, pharmacy, blood } = data;
  const pharmacyAlerts = pharmacy.low_stock_batches + pharmacy.expired_batches;

  return (
    <div className="animate-fade space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          tone="tinted"
          label="Collected this month"
          value={money(billing.collected_this_month)}
          hint={`${money(billing.outstanding)} outstanding on ${billing.unpaid_bills} bills`}
          icon={BadgeDollarSign}
        />
        <StatTile
          label="Appointments today"
          value={appointments.today}
          hint={`${appointments.pending} awaiting approval`}
          icon={CalendarCheck}
        />
        <StatTile
          label="Doctors available"
          value={`${clinic.doctors_available} / ${clinic.doctors}`}
          hint={`${clinic.departments} departments · ${clinic.patients} patients`}
          icon={Stethoscope}
        />
        <StatTile
          label="Pharmacy alerts"
          value={pharmacyAlerts}
          hint={`${pharmacy.low_stock_batches} low · ${pharmacy.expired_batches} expired · ${pharmacy.expiring_in_30_days} expiring soon`}
          icon={Package}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Accounts</h2>
            <Users size={16} className="text-brand-600" />
          </div>
          <ul className="space-y-2 text-sm">
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <li key={role} className="flex justify-between text-ink-700">
                <span>{label}</span>
                <span className="font-medium text-ink-900">{users.by_role[role] ?? 0}</span>
              </li>
            ))}
            <li className="flex justify-between border-t border-white/70 pt-2 text-ink-500">
              <span>Deactivated</span>
              <span>{users.inactive}</span>
            </li>
          </ul>
          <Link to="/admin/users" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
            Manage users →
          </Link>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Appointments by status</h2>
            <Receipt size={16} className="text-brand-600" />
          </div>
          {appointments.by_status.length === 0 ? (
            <p className="text-sm text-ink-500">No appointments yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {appointments.by_status.map((row) => (
                <li key={row.status} className="flex justify-between capitalize text-ink-700">
                  <span>{row.status.replaceAll("_", " ")}</span>
                  <span className="font-medium text-ink-900">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Blood network</h2>
            <Droplet size={16} className="text-rose-500" />
          </div>
          <ul className="space-y-2 text-sm text-ink-700">
            <li className="flex justify-between">
              <span>Registered donors</span>
              <span className="font-medium text-ink-900">{blood.donors}</span>
            </li>
            <li className="flex justify-between">
              <span>Open requests</span>
              <span className="font-medium text-ink-900">{blood.open_requests}</span>
            </li>
          </ul>
          <a
            href={data.django_admin_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
          >
            Every record in the Django admin <ExternalLink size={13} />
          </a>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink-900">Recent activity</h2>
          <Link to="/admin/audit" className="text-sm font-medium text-brand-700 hover:underline">
            Full audit log →
          </Link>
        </div>
        <Table columns={["When", "Who", "Action", "Record"]}>
          {data.recent_activity.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3 text-ink-500">{new Date(entry.created_at).toLocaleString()}</td>
              <td className="px-4 py-3 text-ink-900">{entry.actor_username ?? "system"}</td>
              <td className="px-4 py-3">
                <Badge tone={ACTION_TONES[entry.action]}>{entry.action}</Badge>
              </td>
              <td className="px-4 py-3 text-ink-700">{describeChange(entry)}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
