import { NavLink, Outlet } from "react-router-dom";
import {
  Boxes,
  Building2,
  CalendarClock,
  LayoutDashboard,
  ScrollText,
  UserCog,
} from "lucide-react";
import { PageHeader } from "../../components/index.js";

const TABS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Users & roles", icon: UserCog },
  { to: "/admin/departments", label: "Departments", icon: Building2 },
  { to: "/admin/schedules", label: "Doctor schedules", icon: CalendarClock },
  { to: "/admin/stock", label: "Pharmacy stock", icon: Boxes },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export default function AdminLayout() {
  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Admin"
        subtitle="Accounts, hospital setup, stock and the audit trail."
      />

      <nav className="animate-rise mb-6 flex gap-1 overflow-x-auto rounded-2xl glass p-1.5">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                isActive ? "bg-brand-600 text-white shadow-sm" : "text-ink-700 hover:bg-white/70"
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
