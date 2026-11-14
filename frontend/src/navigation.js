import {
  Activity,
  BarChart3,
  BellRing,
  Boxes,
  CalendarDays,
  CreditCard,
  Droplet,
  FileText,
  FlaskConical,
  FolderHeart,
  LayoutDashboard,
  Pill,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";

const ALL = ["admin", "receptionist", "doctor", "pharmacist", "patient"];

// Every page in the side bar, who may open it, and what each role calls it. App.jsx
// guards its routes from this same list, so a page is never linked for a role that
// would be turned away. The API enforces the real rules; this only keeps each role's
// screen to the work that is theirs:
//   - the front desk runs bookings, arrivals, payments and test results;
//   - a doctor sees their queue, patients, prescriptions and results;
//   - the pharmacy dispenses and keeps stock;
//   - a patient sees their own care.
export const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
  {
    to: "/queue",
    label: "Live queue",
    icon: Activity,
    roles: ["admin", "receptionist", "doctor"],
    labels: { doctor: "My queue" },
  },
  { to: "/my-queue", label: "My queue", icon: Activity, roles: ["patient"] },
  { to: "/appointments", label: "Appointments", icon: CalendarDays, roles: ["admin", "receptionist", "doctor", "patient"] },
  {
    to: "/patients",
    label: "Patients",
    icon: Users,
    roles: ["admin", "receptionist", "doctor"],
    labels: { doctor: "My patients" },
  },
  { to: "/doctors", label: "Doctors", icon: Stethoscope, roles: ["admin", "receptionist", "patient"] },
  {
    to: "/prescriptions",
    label: "Prescriptions",
    icon: FileText,
    roles: ["admin", "doctor", "pharmacist", "patient"],
    labels: { pharmacist: "Dispensing" },
  },
  {
    to: "/lab-tests",
    label: "Lab tests",
    icon: FlaskConical,
    roles: ["admin", "receptionist", "doctor", "patient"],
    labels: { patient: "Lab results" },
  },
  {
    to: "/records",
    label: "Records",
    icon: FolderHeart,
    roles: ["admin", "doctor", "patient"],
    labels: { doctor: "Shared records", patient: "My records" },
  },
  { to: "/medicines", label: "Medicines", icon: Pill, roles: ["admin", "doctor", "pharmacist"], labels: { doctor: "Formulary" } },
  { to: "/stock", label: "Stock", icon: Boxes, roles: ["pharmacist"] },
  {
    to: "/billing",
    label: "Billing",
    icon: CreditCard,
    roles: ["admin", "receptionist", "patient"],
    labels: { patient: "My bills" },
  },
  { to: "/reminders", label: "Reminders", icon: BellRing, roles: ["patient"] },
  { to: "/blood", label: "Blood donors", icon: Droplet, roles: ["admin", "patient"] },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
  { to: "/admin", label: "Admin", icon: ShieldCheck, roles: ["admin"] },
];

// The admin section has sub-pages, so its link stays lit on any of them.
export function isActive(pathname, to) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

// The most specific entry for a path, so /admin/reports is not mistaken for /admin.
function entryFor(path) {
  const clean = path.split("?")[0];
  return NAV.filter((entry) => isActive(clean, entry.to)).sort((a, b) => b.to.length - a.to.length)[0];
}

// The side bar for one role, each entry under the name that role knows it by.
export function navFor(role) {
  return NAV.filter((entry) => entry.roles.includes(role)).map((entry) => ({
    ...entry,
    label: entry.labels?.[role] ?? entry.label,
  }));
}

// Who may open a page; App.jsx passes this to its route guards.
export function rolesFor(path) {
  return entryFor(path)?.roles ?? [];
}

// Whether a role can open a path, so a link is only offered when it leads somewhere.
export function canVisit(role, path) {
  return rolesFor(path).includes(role);
}
