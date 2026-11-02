import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BadgeDollarSign,
  BellRing,
  Boxes,
  CalendarCheck,
  CalendarPlus,
  ClipboardList,
  Clock,
  FilePlus2,
  FileText,
  Package,
  Receipt,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { fetchDashboard, fetchMe } from "../api.js";
import { useAuth } from "../auth-context.js";
import { formatDateTime, humanize, money } from "../format.js";
import { useLoader } from "../hooks.js";
import { canVisit } from "../navigation.js";
import { useToast } from "../toast-context.js";
import { Alert, Card, Loading, Mascot, StatTile } from "../components/index.js";
import PatientFormModal from "../components/PatientFormModal.jsx";

const TILES = {
  today_appointments: { label: "Appointments today", icon: CalendarCheck, to: "/appointments?when=today" },
  pending_approvals: { label: "Awaiting approval", icon: ClipboardList, to: "/appointments?status=pending" },
  patients_seen_this_week: { label: "Seen this week", icon: Stethoscope, to: "/patients" },
  prescriptions_issued: { label: "Prescriptions issued", icon: ClipboardList, to: "/prescriptions" },
  next_appointment: { label: "Next appointment", icon: CalendarCheck, to: "/appointments" },
  active_prescriptions: { label: "Active prescriptions", icon: ClipboardList, to: "/prescriptions" },
  outstanding_balance: { label: "Outstanding balance", icon: Receipt, to: "/billing?status=unpaid" },
  today_queue: { label: "In today's queue", icon: Clock, to: "/queue" },
  unconfirmed: { label: "Unconfirmed bookings", icon: ClipboardList, to: "/appointments?status=pending" },
  unpaid_invoices: { label: "Unpaid invoices", icon: Receipt, to: "/billing?status=unpaid" },
  revenue_this_month: { label: "Revenue this month", icon: BadgeDollarSign, to: "/billing" },
  outstanding_invoices: { label: "Outstanding invoices", icon: Receipt, to: "/billing?status=unpaid" },
  active_doctors: { label: "Doctors available", icon: Stethoscope, to: "/doctors" },
  total_patients: { label: "Patients", icon: Users, to: "/patients" },
  low_stock: { label: "Low on stock", icon: Package, to: "/stock" },
  medicines: { label: "Medicines listed", icon: Package, to: "/medicines" },
  expiring_soon: { label: "Expiring soon", icon: Package, to: "/stock" },
};

const MONEY = ["revenue_this_month", "outstanding_balance"];

// The shortcuts each role reaches for most, so the first screen is a launch pad.
const QUICK_ACTIONS = {
  patient: [
    { to: "/appointments?book=1", label: "Book a visit", icon: CalendarPlus },
    { to: "/my-queue", label: "My place in line", icon: Clock },
    { to: "/records", label: "My records", icon: FileText },
    { to: "/reminders", label: "Medicine reminders", icon: BellRing },
  ],
  receptionist: [
    { to: "/appointments?book=1", label: "Book appointment", icon: CalendarPlus },
    { to: "/patients?new=1", label: "Register patient", icon: UserPlus },
    { to: "/queue", label: "Live queue", icon: Activity },
    { to: "/billing?new=1", label: "New bill", icon: Receipt },
  ],
  doctor: [
    { to: "/queue", label: "My queue", icon: Activity },
    { to: "/appointments?when=today", label: "Today's appointments", icon: CalendarCheck },
    { to: "/prescriptions?new=1", label: "Write prescription", icon: FilePlus2 },
    { to: "/records", label: "Shared records", icon: FileText },
  ],
  pharmacist: [
    { to: "/prescriptions?status=issued", label: "To dispense", icon: FileText },
    { to: "/stock", label: "Stock", icon: Boxes },
    { to: "/medicines", label: "Medicines", icon: Package },
  ],
  admin: [
    { to: "/admin", label: "Admin overview", icon: ShieldCheck },
    { to: "/admin/users", label: "Users & roles", icon: Users },
    { to: "/appointments?book=1", label: "Book appointment", icon: CalendarPlus },
    { to: "/patients?new=1", label: "Register patient", icon: UserPlus },
  ],
};

function format(key, value) {
  if (value === null || value === undefined) return "—";
  if (key === "next_appointment") return formatDateTime(value);
  if (MONEY.includes(key)) return money(value);
  return value;
}

function tileLink(role, key) {
  const to = TILES[key]?.to;
  if (!to) return undefined;
  // Admins manage stock inside the admin section.
  const path = role === "admin" && to === "/stock" ? "/admin/stock" : to;
  return canVisit(role, path) ? path : undefined;
}

function greetingFor(role) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const lines = {
    patient: { mood: "caring", line: "Here is your care at a glance." },
    doctor: { mood: "calm", line: "Your clinic for today." },
    receptionist: { mood: "happy", line: "The front desk, at a glance." },
    pharmacist: { mood: "calm", line: "Dispensing and stock today." },
    admin: { mood: "happy", line: "How the hospital is running today." },
  };

  return { hello, ...(lines[role] ?? { mood: "happy", line: "Here is how things look today." }) };
}

export default function Dashboard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(() => fetchDashboard(), []);
  const { data, error, isLoading, reload } = useLoader(load, "Could not load your overview.");

  const role = user?.role;
  const stats = { ...data };
  delete stats.role;
  const greeting = greetingFor(role);
  const tiles = Object.entries(stats).filter(([key]) => key !== "appointments_by_status");
  const byStatus = stats.appointments_by_status ?? [];
  const peak = Math.max(1, ...byStatus.map((row) => row.count));
  const actions = (QUICK_ACTIONS[role] ?? []).filter((action) => canVisit(role, action.to));
  const needsProfile = role === "patient" && !user?.patient_id;

  async function profileSaved() {
    setProfileOpen(false);
    toast.success("Profile saved. You can book a visit now.");
    setUser(await fetchMe());
    reload();
  }

  return (
    <>
      <Card className="animate-rise sheen mb-6 flex flex-wrap items-center gap-5 p-6">
        <Mascot size={88} mood={greeting.mood} />
        <div className="min-w-0 flex-1">
          <span className="pill bg-brand-100 text-brand-700">Signed in as {role}</span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">
            {greeting.hello}, {user?.first_name || user?.username || ""}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{greeting.line}</p>
        </div>
      </Card>

      {needsProfile && (
        <Card tone="tinted" className="animate-rise mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white/15 p-2.5">
              <UserRound size={20} />
            </span>
            <div>
              <p className="text-lg font-semibold">One step left: your patient profile</p>
              <p className="text-sm text-white/75">
                Add your phone, address and a few details so the clinic can book you in.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-brand-700 transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Complete my profile
          </button>
        </Card>
      )}

      {actions.length > 0 && !needsProfile && (
        <nav aria-label="Shortcuts" className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {actions.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="glass lift flex items-center gap-3 rounded-2xl p-4 text-sm font-medium text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span className="rounded-xl bg-brand-600 p-2 text-white">
                <Icon size={16} />
              </span>
              {label}
            </Link>
          ))}
        </nav>
      )}

      <Alert onRetry={reload}>{error}</Alert>

      {isLoading && !data && <Loading message="Building your overview…" />}

      {data && (
        <>
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map(([key, value]) => {
              const meta = TILES[key] ?? { label: humanize(key) };
              const alarming = key === "low_stock" && Number(value) > 0;
              return (
                <StatTile
                  key={key}
                  label={meta.label}
                  value={format(key, value)}
                  icon={meta.icon}
                  tone={alarming ? "tinted" : "glass"}
                  to={tileLink(role, key)}
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

              <div className="space-y-1">
                {byStatus.map((row) => (
                  <Link
                    key={row.status}
                    to={`/appointments?status=${row.status}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <span className="w-32 text-xs capitalize text-ink-500">{humanize(row.status)}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-brand-100/70">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all duration-700"
                        style={{ width: `${(row.count / peak) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs font-semibold text-ink-700">{row.count}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {role === "patient" && !needsProfile && (
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

      {profileOpen && (
        <PatientFormModal open self onClose={() => setProfileOpen(false)} onSaved={profileSaved} />
      )}
    </>
  );
}
