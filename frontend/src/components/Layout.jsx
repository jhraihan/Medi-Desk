import { Link, Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

export default function Layout() {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 bg-white px-4 py-6">
        <h1 className="mb-8 text-xl font-bold text-indigo-600">
          Hospital Admin
        </h1>
        <nav className="flex flex-col gap-2">
          <Link
            to="/appointments"
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Appointments
          </Link>
          <Link
            to="/prescriptions"
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Prescriptions
          </Link>
          <Link
            to="/doctors"
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Doctors
          </Link>
          <Link
            to="/patients"
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Patients
          </Link>
          <Link
            to="/medicines"
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Medicines
          </Link>
          <Link
            to="/billing"
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Billing
          </Link>
        </nav>
        <div className="absolute bottom-6">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">
        <Outlet />{" "}

      </main>
    </div>
  );
}
