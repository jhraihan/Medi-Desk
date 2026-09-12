import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider, ProtectedRoute, RoleRoute } from "./auth.jsx";
import BloodDonation from "./pages/BloodDonation";
import Dashboard from "./pages/Dashboard";
import MyQueue from "./pages/MyQueue";
import Records from "./pages/Records";
import Queue from "./pages/Queue";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Appointments from "./pages/Appointments";
import Prescriptions from "./pages/Prescriptions";
import Doctors from "./pages/Doctors";
import Patients from "./pages/Patients";
import Medicines from "./pages/Medicines";
import Billing from "./pages/Billing";

const STAFF = ["admin", "receptionist"];
const CLINICAL = ["admin", "doctor"];

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50">
      <h1 className="text-2xl font-bold text-slate-800">Page not found</h1>
      <Link to="/dashboard" className="text-sm text-indigo-600 hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/appointments" element={<Appointments />} />
              <Route path="/prescriptions" element={<Prescriptions />} />
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

              <Route element={<RoleRoute allow={["patient", "doctor", "admin"]} />}>
                <Route path="/records" element={<Records />} />
              </Route>

              <Route element={<RoleRoute allow={[...STAFF, "doctor"]} />}>
                <Route path="/queue" element={<Queue />} />
              </Route>
              <Route index element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
