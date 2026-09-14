const WRITERS = {
  departments: ["admin"],
  doctors: ["admin", "receptionist"],
  patients: ["admin", "receptionist", "patient"],
  appointments: ["admin", "receptionist", "doctor", "patient"],
  prescriptions: ["admin", "doctor"],
  medicines: ["admin", "pharmacist"],
  bills: ["admin", "receptionist"],
  dispense: ["admin", "pharmacist"],
};

export function canWrite(role, resource) {
  return WRITERS[resource]?.includes(role) ?? false;
}

export function isStaff(role) {
  return ["admin", "receptionist"].includes(role);
}
