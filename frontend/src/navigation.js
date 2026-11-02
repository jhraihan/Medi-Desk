import {
  Activity,
  BellRing,
  Boxes,
  CalendarDays,
  CreditCard,
  Droplet,
  FileText,
  FolderHeart,
  LayoutDashboard,
  Pill,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";

// Every page in the side bar and who may open it. App.jsx guards the same routes.
export const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/queue", label: "Live Queue", icon: Activity, roles: ["admin", "receptionist", "doctor"] },
  { to: "/my-queue", label: "My Queue", icon: Activity, roles: ["patient"] },
  { to: "/appointments", label: "Appointments", icon: CalendarDays, roles: ["admin", "receptionist", "doctor", "patient"] },
  { to: "/prescriptions", label: "Prescriptions", icon: FileText, roles: ["admin", "doctor", "patient", "pharmacist"] },
  { to: "/records", label: "Records", icon: FolderHeart, roles: ["patient", "doctor", "admin"] },
  { to: "/blood", label: "Blood", icon: Droplet },
  { to: "/reminders", label: "Reminders", icon: BellRing, roles: ["patient"] },
  { to: "/doctors", label: "Doctors", icon: Stethoscope },
  { to: "/patients", label: "Patients", icon: Users, roles: ["admin", "receptionist", "doctor"] },
  { to: "/medicines", label: "Medicines", icon: Pill, roles: ["admin", "doctor", "receptionist", "pharmacist"] },
  { to: "/billing", label: "Billing", icon: CreditCard, roles: ["admin", "receptionist", "patient"] },
  { to: "/stock", label: "Stock", icon: Boxes, roles: ["pharmacist"] },
  { to: "/admin", label: "Admin", icon: ShieldCheck, roles: ["admin"] },
];

// The admin section has sub-pages, so its link stays lit on any of them.
export function isActive(pathname, to) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

// Whether a role can open a path, so a link is only offered when it leads somewhere.
export function canVisit(role, path) {
  const item = NAV.find((entry) => isActive(path.split("?")[0], entry.to));
  return Boolean(item) && (!item.roles || item.roles.includes(role));
}
