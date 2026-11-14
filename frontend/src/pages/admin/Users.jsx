import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import {
  adminUsersApi,
  departmentsApi,
  setUserPassword,
  unlockUser,
} from "../../api.js";
import { apiError } from "../../errors.js";
import { useAuth } from "../../auth-context.js";
import { BLOOD_GROUPS } from "../../constants.js";
import { formatDateTime, fullName } from "../../format.js";
import { useDebounced } from "../../hooks.js";
import { useToast } from "../../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  Pager,
  SearchInput,
  Select,
  Table,
  Textarea,
} from "../../components/index.js";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "doctor", label: "Doctor" },
  { value: "receptionist", label: "Receptionist" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "patient", label: "Patient" },
];

const ROLE_TONES = {
  admin: "danger",
  doctor: "brand",
  receptionist: "warning",
  pharmacist: "success",
  patient: "neutral",
};

const EMPTY_ACCOUNT = {
  username: "",
  first_name: "",
  last_name: "",
  email: "",
  role: "receptionist",
  is_active: true,
  password: "",
};

const EMPTY_DOCTOR = {
  department: "",
  specialization: "",
  phone: "",
  experience: "",
  consultation_fee: "",
  qualification: "",
};

const EMPTY_PATIENT = { gender: "", date_of_birth: "", blood_group: "", phone: "", address: "" };

export default function Users() {
  const { user: me } = useAuth();

  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, results: [] });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const toast = useToast();
  const [departments, setDepartments] = useState([]);

  // editing: null = form closed, {} = new account, a user row = editing that account
  const [editing, setEditing] = useState(null);
  const [account, setAccount] = useState(EMPTY_ACCOUNT);
  const [doctor, setDoctor] = useState(EMPTY_DOCTOR);
  const [patient, setPatient] = useState(EMPTY_PATIENT);
  const [isSaving, setIsSaving] = useState(false);

  const [passwordFor, setPasswordFor] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [deactivating, setDeactivating] = useState(null);
  const [isWorking, setIsWorking] = useState(false);

  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((c) => c + 1);
  const settledSearch = useDebounced(search);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setIsLoading(true);
        const params = { page };
        if (settledSearch) params.search = settledSearch;
        if (roleFilter) params.role = roleFilter;
        if (activeFilter) params.is_active = activeFilter;
        const rows = await adminUsersApi.listPage(params);
        if (!active) return;
        setData(rows);
        setError("");
      } catch (problem) {
        if (active) setError(apiError(problem, "Could not load accounts."));
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [page, settledSearch, roleFilter, activeFilter, reloadCount]);

  useEffect(() => {
    departmentsApi.listAll().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  function filterBy(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

  function openNew() {
    setFormError("");
    setEditing({});
    setAccount(EMPTY_ACCOUNT);
    setDoctor(EMPTY_DOCTOR);
    setPatient(EMPTY_PATIENT);
  }

  function openEdit(row) {
    setFormError("");
    setEditing(row);
    setAccount({ ...EMPTY_ACCOUNT, ...row, password: "" });
    setDoctor(EMPTY_DOCTOR);
    setPatient(EMPTY_PATIENT);
  }

  const isNew = editing && !editing.id;
  const needsDoctorProfile = account.role === "doctor" && (isNew || !editing?.has_doctor_profile);
  const offersPatientProfile = account.role === "patient" && (isNew || !editing?.has_patient_profile);
  const editingSelf = editing?.id === me?.id;

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      const payload = {
        username: account.username,
        first_name: account.first_name,
        last_name: account.last_name,
        email: account.email,
        role: account.role,
      };
      if (isNew) payload.password = account.password;
      else payload.is_active = account.is_active;

      if (needsDoctorProfile) {
        payload.doctor_profile = {
          ...doctor,
          department: doctor.department ? Number(doctor.department) : null,
          experience: Number(doctor.experience || 0),
          consultation_fee: doctor.consultation_fee || "0",
        };
      }
      // The patient profile is optional; send it only once the required parts are in.
      if (offersPatientProfile && patient.gender && patient.phone && patient.address) {
        payload.patient_profile = {
          ...patient,
          date_of_birth: patient.date_of_birth || null,
        };
      }

      if (isNew) {
        await adminUsersApi.create(payload);
        toast.success(`Account ${payload.username} created.`);
      } else {
        await adminUsersApi.patch(editing.id, payload);
        toast.success(`Account ${payload.username} updated.`);
      }
      setEditing(null);
      reload();
    } catch (problem) {
      setFormError(apiError(problem, "Could not save that account."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSetPassword(event) {
    event.preventDefault();
    setFormError("");
    setIsWorking(true);
    try {
      await setUserPassword(passwordFor.id, newPassword);
      toast.success(`Password changed for ${passwordFor.username}. Their other sessions were signed out.`);
      setPasswordFor(null);
      setNewPassword("");
      reload();
    } catch (problem) {
      setFormError(apiError(problem, "Could not set that password."));
    } finally {
      setIsWorking(false);
    }
  }

  async function setActive(row, isActive) {
    setIsWorking(true);
    try {
      await adminUsersApi.patch(row.id, { is_active: isActive });
      toast.success(isActive ? `${row.username} reactivated.` : `${row.username} deactivated and signed out.`);
      setDeactivating(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not change that account."));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleUnlock(row) {
    try {
      await unlockUser(row.id);
      toast.success(`${row.username} can sign in again.`);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not unlock that account."));
    }
  }

  return (
    <div className="animate-fade">
      <Alert onRetry={reload}>{error}</Alert>

      <Card className="mb-5 grid gap-3 p-5 sm:grid-cols-4">
        <SearchInput
          label="Search"
          placeholder="Username, name or email"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          className="sm:col-span-2"
        />
        <Select label="Role" placeholder="All roles" value={roleFilter} onChange={filterBy(setRoleFilter)}>
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </Select>
        <Select label="Status" placeholder="Any status" value={activeFilter} onChange={filterBy(setActiveFilter)}>
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </Select>
      </Card>

      <Modal
        open={Boolean(editing)}
        size="xl"
        title={isNew ? "New account" : `Edit ${editing?.username}`}
        error={formError}
        busy={isSaving}
        onClose={() => setEditing(null)}
        onSubmit={handleSave}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" busy={isSaving}>
              {isSaving ? "Saving..." : isNew ? "Create account" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Username"
            required
            autoComplete="off"
            value={account.username}
            onChange={(e) => setAccount({ ...account, username: e.target.value })}
          />
          <Input
            label="First name"
            value={account.first_name}
            onChange={(e) => setAccount({ ...account, first_name: e.target.value })}
          />
          <Input
            label="Last name"
            value={account.last_name}
            onChange={(e) => setAccount({ ...account, last_name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={account.email}
            onChange={(e) => setAccount({ ...account, email: e.target.value })}
          />
          <Select
            label="Role"
            required
            disabled={editingSelf}
            value={account.role}
            onChange={(e) => setAccount({ ...account, role: e.target.value })}
          >
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </Select>
          {isNew ? (
            <Input
              label="Starting password"
              type="password"
              required
              autoComplete="new-password"
              value={account.password}
              onChange={(e) => setAccount({ ...account, password: e.target.value })}
            />
          ) : (
            <Select
              label="Status"
              disabled={editingSelf}
              value={account.is_active ? "true" : "false"}
              onChange={(e) => setAccount({ ...account, is_active: e.target.value === "true" })}
            >
              <option value="true">Active</option>
              <option value="false">Deactivated</option>
            </Select>
          )}
        </div>

        {account.role === "admin" && (
          <p className="mt-3 text-xs text-ink-500">
            Admins can change every record, here and in the Django admin.
          </p>
        )}

        {needsDoctorProfile && (
          <fieldset className="mt-5 border-t border-white/70 pt-4">
            <legend className="mb-3 text-sm font-semibold text-ink-900">Doctor profile</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="Department"
                placeholder="No department"
                value={doctor.department}
                onChange={(e) => setDoctor({ ...doctor, department: e.target.value })}
              >
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
              <Input
                label="Specialization"
                required
                value={doctor.specialization}
                onChange={(e) => setDoctor({ ...doctor, specialization: e.target.value })}
              />
              <Input
                label="Phone"
                required
                value={doctor.phone}
                onChange={(e) => setDoctor({ ...doctor, phone: e.target.value })}
              />
              <Input
                label="Years of experience"
                type="number"
                min="0"
                required
                value={doctor.experience}
                onChange={(e) => setDoctor({ ...doctor, experience: e.target.value })}
              />
              <Input
                label="Consultation fee"
                type="number"
                min="0"
                step="0.01"
                value={doctor.consultation_fee}
                onChange={(e) => setDoctor({ ...doctor, consultation_fee: e.target.value })}
              />
              <Input
                label="Qualification"
                value={doctor.qualification}
                onChange={(e) => setDoctor({ ...doctor, qualification: e.target.value })}
              />
            </div>
          </fieldset>
        )}

        {offersPatientProfile && (
          <fieldset className="mt-5 border-t border-white/70 pt-4">
            <legend className="mb-1 text-sm font-semibold text-ink-900">Patient profile (optional)</legend>
            <p className="mb-3 text-xs text-ink-500">
              Fill in gender, phone and address to create the patient record now.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="Gender"
                placeholder="Select..."
                value={patient.gender}
                onChange={(e) => setPatient({ ...patient, gender: e.target.value })}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
              <Input
                label="Date of birth"
                type="date"
                value={patient.date_of_birth}
                onChange={(e) => setPatient({ ...patient, date_of_birth: e.target.value })}
              />
              <Select
                label="Blood group"
                placeholder="Unknown"
                value={patient.blood_group}
                onChange={(e) => setPatient({ ...patient, blood_group: e.target.value })}
              >
                {BLOOD_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </Select>
              <Input
                label="Phone"
                value={patient.phone}
                onChange={(e) => setPatient({ ...patient, phone: e.target.value })}
              />
            </div>
            <Textarea
              label="Address"
              className="mt-4"
              value={patient.address}
              onChange={(e) => setPatient({ ...patient, address: e.target.value })}
            />
          </fieldset>
        )}
      </Modal>

      <Modal
        open={Boolean(passwordFor)}
        size="sm"
        title="Set a new password"
        subtitle={passwordFor && `For ${passwordFor.username}`}
        error={formError}
        busy={isWorking}
        onClose={() => setPasswordFor(null)}
        onSubmit={handleSetPassword}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordFor(null)} disabled={isWorking}>
              Cancel
            </Button>
            <Button type="submit" busy={isWorking}>
              {isWorking ? "Saving..." : "Set password"}
            </Button>
          </>
        }
      >
        <Input
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <p className="mt-2 text-xs text-ink-500">
          This also clears any sign-in lockout and signs the account out of every device.
        </p>
      </Modal>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">
          {isLoading ? "Loading..." : `${data.count} accounts`}
        </h2>
        <Button onClick={openNew}>
          <Plus size={14} /> New account
        </Button>
      </div>

      <Table
        columns={["Account", "Role", "Status", "Last sign-in", ""]}
        isLoading={isLoading}
        empty={search || roleFilter || activeFilter ? "No accounts match these filters." : "No accounts yet."}
      >
        {data.results.map((row) => (
          <tr key={row.id} className="transition-colors duration-150 hover:bg-white/60">
            <td className="px-4 py-3">
              <p className="font-medium text-ink-900">{fullName(row)}</p>
              <p className="text-xs text-ink-500">
                {row.username}
                {row.email && ` · ${row.email}`}
              </p>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <Badge tone={ROLE_TONES[row.role]}>{row.role}</Badge>
                {row.is_superuser && <Badge tone="danger">superuser</Badge>}
                {row.role === "doctor" && !row.has_doctor_profile && (
                  <Badge tone="warning">no doctor profile</Badge>
                )}
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <Badge tone={row.is_active ? "success" : "neutral"}>
                  {row.is_active ? "active" : "deactivated"}
                </Badge>
                {row.is_locked && <Badge tone="danger">locked out</Badge>}
              </div>
            </td>
            <td className="px-4 py-3 text-ink-500">
              {row.last_login ? formatDateTime(row.last_login) : "Never"}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                  <Pencil size={13} /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFormError("");
                    setPasswordFor(row);
                    setNewPassword("");
                  }}
                >
                  <KeyRound size={13} /> Password
                </Button>
                {row.is_locked && (
                  <Button size="sm" variant="secondary" onClick={() => handleUnlock(row)}>
                    Unlock
                  </Button>
                )}
                {row.id !== me?.id &&
                  (row.is_active ? (
                    <Button size="sm" variant="danger-ghost" onClick={() => setDeactivating(row)}>
                      Deactivate
                    </Button>
                  ) : (
                    <Button size="sm" variant="success" disabled={isWorking} onClick={() => setActive(row, true)}>
                      Reactivate
                    </Button>
                  ))}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} count={data.count} onChange={setPage} />

      <ConfirmDialog
        open={Boolean(deactivating)}
        title={`Deactivate ${deactivating?.username}?`}
        message="They are signed out everywhere and cannot sign in until reactivated. Their records stay intact."
        confirmLabel="Deactivate"
        workingLabel="Deactivating..."
        isWorking={isWorking}
        onConfirm={() => setActive(deactivating, false)}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}
