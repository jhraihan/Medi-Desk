import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../auth-context.js";

const NAV = [
  { to: "/appointments", label: "Appointments" },
  { to: "/prescriptions", label: "Prescriptions" },
  { to: "/doctors", label: "Doctors" },
  { to: "/patients", label: "Patients", roles: ["admin", "receptionist", "doctor"] },
  { to: "/medicines", label: "Medicines", roles: ["admin", "doctor", "receptionist", "pharmacist"] },
  { to: "/billing", label: "Billing", roles: ["admin", "receptionist", "patient"] },
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

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white px-4 py-6">
        <h1 className="mb-8 text-xl font-bold text-indigo-600">Hospital Admin</h1>

        <nav className="flex flex-1 flex-col gap-2">
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                pathname === item.to
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 border-t border-slate-200 pt-4">
          {user && (
            <p className="mb-2 px-3 text-xs text-slate-500">
              {user.username} · {user.role}
            </p>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 text-sm font-medium text-red-600 hover:text-red-700"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
