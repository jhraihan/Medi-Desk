import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import Layout from "./components/Layout";
import ToastProvider from "./components/Toaster";
import { Mascot } from "./components/index.js";
import { AuthProvider, ProtectedRoute, RoleRoute } from "./auth.jsx";
import BloodDonation from "./pages/BloodDonation";
import Dashboard from "./pages/Dashboard";
import MyQueue from "./pages/MyQueue";
import Records from "./pages/Records";
import Reminders from "./pages/Reminders";
import Queue from "./pages/Queue";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Appointments from "./pages/Appointments";
import Prescriptions from "./pages/Prescriptions";
import Doctors from "./pages/Doctors";
import Patients from "./pages/Patients";
import Medicines from "./pages/Medicines";
import Billing from "./pages/Billing";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOverview from "./pages/admin/Overview";
import AdminUsers from "./pages/admin/Users";
import AdminDepartments from "./pages/admin/Departments";
import AdminSchedules from "./pages/admin/Schedules";
import AdminStock from "./pages/admin/Stock";
import AdminAuditLog from "./pages/admin/AuditLog";

const STAFF = ["admin", "receptionist"];
const CLINICAL = ["admin", "doctor"];

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong animate-rise flex max-w-sm flex-col items-center rounded-3xl p-10 text-center">
        <Mascot size={96} mood="alert" />
        <h1 className="mt-4 text-2xl font-semibold text-ink-900">Page not found</h1>
        <p className="mt-1 text-sm text-ink-500">
          The link may be old, or the address has a typo.
        </p>
        <Link
          to="/dashboard"
          className="mt-5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route element={<RoleRoute allow={["admin", "receptionist", "doctor", "patient"]} />}>
                  <Route path="/appointments" element={<Appointments />} />
                </Route>
                <Route element={<RoleRoute allow={["admin", "doctor", "patient", "pharmacist"]} />}>
                  <Route path="/prescriptions" element={<Prescriptions />} />
                </Route>
                <Route path="/doctors" element={<Doctors />} />

                <Route element={<RoleRoute allow={[...STAFF, "doctor"]} />}>
                  <Route path="/patients" element={<Patients />} />
                </Route>

                <Route element={<RoleRoute allow={[...CLINICAL, "receptionist", "pharmacist"]} />}>
                  <Route path="/medicines" element={<Medicines />} />
                </Route>

                <Route element={<RoleRoute allow={[...STAFF, "patient"]} />}>
                  <Route path="/billing" element={<Billing />} />
                </Route>

                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/my-queue" element={<MyQueue />} />
                <Route path="/blood" element={<BloodDonation />} />

                <Route element={<RoleRoute allow={["patient"]} />}>
                  <Route path="/reminders" element={<Reminders />} />
                </Route>

                <Route element={<RoleRoute allow={["patient", "doctor", "admin"]} />}>
                  <Route path="/records" element={<Records />} />
                </Route>

                <Route element={<RoleRoute allow={[...STAFF, "doctor"]} />}>
                  <Route path="/queue" element={<Queue />} />
                </Route>

                {/* The API enforces the same rule; this only spares other roles a page of 403s. */}
                <Route element={<RoleRoute allow={["admin"]} />}>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminOverview />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="departments" element={<AdminDepartments />} />
                    <Route path="schedules" element={<AdminSchedules />} />
                    <Route path="stock" element={<AdminStock />} />
                    <Route path="audit" element={<AdminAuditLog />} />
                  </Route>
                </Route>

                <Route element={<RoleRoute allow={["pharmacist"]} />}>
                  <Route path="/stock" element={<AdminStock />} />
                </Route>
                <Route index element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
