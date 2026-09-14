import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { patientsApi } from "../api.js";
import { apiError } from "../errors.js";
import { useAuth } from "../auth-context.js";
import { canWrite } from "../permissions.js";
import { useFlash } from "../flash.js";
import {
  Alert,
  Button,
  IconButton,
  Input,
  PageHeader,
  Select,
  Table,
  Textarea,
} from "../components/index.js";

export default function Patients() {
  const { user } = useAuth();
  const mayEdit = canWrite(user?.role, "patients");

  const [patients, setPatients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  const [formIsOpen, setFormIsOpen] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((c) => c + 1);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const data = await patientsApi.list();
        setPatients(data);
      } catch (err) {
        setError(apiError(err, "Could not load patients."));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [reloadCount]);


  async function handleSave(e) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await patientsApi.create({
        date_of_birth: dateOfBirth,
        gender,
        blood_group: bloodGroup,
        address,
        phone,
      });
      setNotice("Patient registered.");
      setFormIsOpen(false);
      reload();
    } catch (err) {
      setError(apiError(err, "Could not add that patient."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle="Manage patient records and demographics."
      />

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      {formIsOpen && (
        <form
          onSubmit={handleSave}
          className="animate-rise glass-strong mb-5 rounded-2xl p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">
              Add Patient Details
            </h2>
            <IconButton onClick={() => setFormIsOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Date of birth"
              type="date"
              required
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
            <Select
              label="Gender"
              required
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">Select...</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </Select>
            <Select
              label="Blood Group"
              required
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
            >
              <option value="">Select...</option>
              <option value="A+">A+</option>
              <option value="O+">O+</option>
              <option value="B+">B+</option>
              <option value="AB+">AB+</option>
              <option value="A-">A-</option>
              <option value="O-">O-</option>
              <option value="B-">B-</option>
              <option value="AB-">AB-</option>
            </Select>
            <Input
              label="Phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Textarea
            label="Address"
            className="mt-4"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Patient"}
            </Button>
            <Button variant="secondary" onClick={() => setFormIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="animate-fade">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink-900">
            {isLoading ? "Loading..." : `${patients.length} Patients`}
          </h2>
          {mayEdit && (
            <Button onClick={() => setFormIsOpen(true)}>
              <Plus size={14} /> Add Patient
            </Button>
          )}
        </div>

        <Table
          columns={["ID", "Name", "Age", "Gender", "Blood Group", "Phone"]}
        >
          {patients.map((pat) => (
            <tr
              key={pat.id}
              className="transition-colors duration-150 hover:bg-white/60"
            >
              <td className="px-4 py-3 text-ink-700">{pat.id}</td>
              <td className="px-4 py-3 text-ink-700">
                {pat.user_details?.first_name} {pat.user_details?.last_name}
              </td>
              <td className="px-4 py-3 text-ink-700">{pat.age ?? "—"}</td>
              <td className="px-4 py-3 text-ink-700">{pat.gender}</td>
              <td className="px-4 py-3 text-ink-700">{pat.blood_group}</td>
              <td className="px-4 py-3 text-ink-700">{pat.phone}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
