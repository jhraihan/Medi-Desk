import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register"; 
import Appointments from "./pages/Appointments";
import Prescriptions from "./pages/Prescriptions";
import Doctors from "./pages/Doctors";
import Patients from "./pages/Patients";
import Medicines from "./pages/Medicines";
import Billing from "./pages/Billing";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />{" "}

        <Route element={<Layout />}>
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/prescriptions" element={<Prescriptions />} />
          <Route path="/doctors" element={<Doctors />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/medicines" element={<Medicines />} />
          <Route path="/billing" element={<Billing />} />
        </Route>

        <Route path="*" element={<Navigate to="/appointments" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
