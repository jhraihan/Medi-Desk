import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Pill,
  Stethoscope,
  Users,
} from "lucide-react";
import { useAuth } from "../auth-context.js";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/queue", label: "Live Queue", icon: Activity, roles: ["admin", "receptionist", "doctor"] },
  { to: "/my-queue", label: "My Queue", icon: Activity, roles: ["patient"] },
  { to: "/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/prescriptions", label: "Prescriptions", icon: FileText },
  { to: "/doctors", label: "Doctors", icon: Stethoscope },
  { to: "/patients", label: "Patients", icon: Users, roles: ["admin", "receptionist", "doctor"] },
  { to: "/medicines", label: "Medicines", icon: Pill, roles: ["admin", "doctor", "receptionist", "pharmacist"] },
  { to: "/billing", label: "Billing", icon: CreditCard, roles: ["admin", "receptionist", "patient"] },
];

export default function Layout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const links = NAV.filter((item) => !item.roles || item.roles.includes(user?.role));
  const initials = (user?.first_name?.[0] || user?.username?.[0] || "?").toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 flex-col p-4 md:flex">
        <div className="glass-strong flex h-full flex-col rounded-2xl p-4">
          <div className="mb-7 flex items-center gap-2 px-1">
            <span className="rounded-xl bg-brand-600 p-2 text-white">
              <Activity size={18} />
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink-900">MediDesk</span>
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {links.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    active
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-ink-700 hover:bg-white/70"
                  }`}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-5 border-t border-white/70 pt-4">
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{user?.username}</p>
                <p className="text-xs capitalize text-ink-500">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50"
            >
              <LogOut size={16} /> Log out
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
        <Outlet />
      </main>

      <nav className="glass-strong fixed bottom-0 left-0 right-0 z-20 flex justify-around px-2 py-2 md:hidden">
        {links.slice(0, 5).map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors duration-200 ${
                active ? "text-brand-700" : "text-ink-500"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
