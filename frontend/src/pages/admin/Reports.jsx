import { useCallback, useState } from "react";
import {
  BadgeDollarSign,
  CalendarCheck,
  Download,
  FlaskConical,
  Percent,
  Receipt,
  Stethoscope,
  Users,
} from "lucide-react";
import { fetchAdminReport } from "../../api.js";
import { formatDate, humanize, localISODate, money } from "../../format.js";
import { useLoader } from "../../hooks.js";
import { Alert, Button, Card, Chips, Input, Loading, StatTile, Table } from "../../components/index.js";

const METHOD_LABELS = {
  cash: "Cash",
  card: "Card",
  mobile: "Mobile banking",
  transfer: "Bank transfer",
  insurance: "Insurance",
};

function periodFor(preset) {
  const today = new Date();
  const day = (offset) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return localISODate(date);
  };
  switch (preset) {
    case "today":
      return { from: day(0), to: day(0) };
    case "7d":
      return { from: day(-6), to: day(0) };
    case "30d":
      return { from: day(-29), to: day(0) };
    case "last-month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: localISODate(first), to: localISODate(last) };
    }
    default:
      return { from: localISODate(new Date(today.getFullYear(), today.getMonth(), 1)), to: day(0) };
  }
}

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "30d", label: "Last 30 days" },
];

function csvCell(value) {
  const text = String(value ?? "");
  // A spreadsheet runs a cell that starts with one of these as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function downloadCsv(report) {
  const sections = [
    ["Period", `${report.from} to ${report.to}`],
    [],
    ["Totals"],
    ...Object.entries(report.totals).map(([key, value]) => [humanize(key), value]),
    [],
    ["Day", "Billed", "Collected", "Bills", "Completed visits"],
    ...report.daily.map((row) => [row.date, row.billed, row.collected, row.bills, row.visits]),
    [],
    ["Service", "Lines", "Amount"],
    ...report.by_service.map((row) => [humanize(row.service_type), row.lines, row.total]),
    [],
    ["Payment method", "Payments", "Amount"],
    ...report.by_payment_method.map((row) => [METHOD_LABELS[row.method] ?? row.method, row.payments, row.total]),
    [],
    ["Doctor", "Specialization", "Appointments", "Completed", "Cancelled", "Billed"],
    ...report.by_doctor.map((row) => [row.doctor, row.specialization, row.appointments, row.completed, row.cancelled, row.billed]),
    [],
    ["Medicine", "Quantity", "Prescriptions"],
    ...report.top_medicines.map((row) => [row.name, row.quantity, row.prescriptions]),
    [],
    ["Test", "Orders"],
    ...report.top_tests.map((row) => [row.name, row.orders]),
  ];
  const csv = sections.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `medidesk-report-${report.from}-to-${report.to}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Section({ title, children, className = "" }) {
  return (
    <section className={className}>
      <h2 className="mb-2 font-semibold text-ink-900">{title}</h2>
      {children}
    </section>
  );
}

export default function Reports() {
  const [preset, setPreset] = useState("month");
  const [period, setPeriod] = useState(() => periodFor("month"));

  const load = useCallback(() => fetchAdminReport(period), [period]);
  const { data, error, isLoading, reload } = useLoader(load, "Could not build the report.");
  const totals = data?.totals;

  function choosePreset(value) {
    setPreset(value);
    setPeriod(periodFor(value));
  }

  function setDate(key) {
    return (event) => {
      setPreset("");
      setPeriod((current) => ({ ...current, [key]: event.target.value }));
    };
  }

  return (
    <div className="animate-fade">
      <Card className="mb-5 flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <Chips label="Period" options={PRESETS} value={preset} onChange={choosePreset} />
        <div className="flex flex-wrap items-end gap-3">
          <Input label="From" type="date" value={period.from} max={period.to} onChange={setDate("from")} />
          <Input label="To" type="date" value={period.to} min={period.from} onChange={setDate("to")} />
          <Button variant="secondary" disabled={!data} onClick={() => downloadCsv(data)}>
            <Download size={14} /> CSV
          </Button>
        </div>
      </Card>

      <Alert onRetry={reload}>{error}</Alert>
      {isLoading && !data && <Loading message="Adding it all up…" />}

      {data && (
        <div className={`space-y-6 ${isLoading ? "opacity-60" : ""}`} aria-busy={isLoading || undefined}>
          <p className="text-sm text-ink-500">
            {formatDate(data.from)} to {formatDate(data.to)}. Billed counts bills raised in the period; collected
            counts payments received in it.
          </p>

          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Billed" value={money(totals.billed)} icon={Receipt} hint={`${totals.bills} bills · ${totals.unpaid_bills} unpaid`} />
            <StatTile label="Collected" value={money(totals.collected)} icon={BadgeDollarSign} tone="tinted" />
            <StatTile label="Discounts given" value={money(totals.discounts)} icon={Percent} hint={`VAT / tax ${money(totals.tax)}`} />
            <StatTile
              label="Visits completed"
              value={totals.completed_visits}
              icon={CalendarCheck}
              hint={`${totals.appointments} booked · ${totals.cancelled_visits} cancelled`}
            />
            <StatTile label="Patients seen" value={totals.patients_seen} icon={Users} />
            <StatTile label="Tests ordered" value={totals.tests_ordered} icon={FlaskConical} />
            <StatTile label="Doctors with visits" value={data.by_doctor.length} icon={Stethoscope} />
          </div>

          <Section title="Day by day">
            <Table columns={["Day", "Billed", "Collected", "Bills", "Visits completed"]} empty="Nothing happened in this period.">
              {data.daily.map((row) => (
                <tr key={row.date}>
                  <td className="px-4 py-2.5 font-medium text-ink-900" data-label="Day">{formatDate(row.date)}</td>
                  <td className="px-4 py-2.5 text-ink-700" data-label="Billed">{money(row.billed)}</td>
                  <td className="px-4 py-2.5 font-medium text-emerald-700" data-label="Collected">{money(row.collected)}</td>
                  <td className="px-4 py-2.5 text-ink-700" data-label="Bills">{row.bills}</td>
                  <td className="px-4 py-2.5 text-ink-700" data-label="Visits completed">{row.visits}</td>
                </tr>
              ))}
            </Table>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Billed by service">
              <Table columns={["Service", "Lines", "Amount"]} empty="No bill lines in this period.">
                {data.by_service.map((row) => (
                  <tr key={row.service_type}>
                    <td className="px-4 py-2.5 capitalize text-ink-900" data-label="Service">{humanize(row.service_type)}</td>
                    <td className="px-4 py-2.5 text-ink-700" data-label="Lines">{row.lines}</td>
                    <td className="px-4 py-2.5 font-medium text-ink-900" data-label="Amount">{money(row.total)}</td>
                  </tr>
                ))}
              </Table>
            </Section>
            <Section title="Collected by payment method">
              <Table columns={["Method", "Payments", "Amount"]} empty="No payments in this period.">
                {data.by_payment_method.map((row) => (
                  <tr key={row.method}>
                    <td className="px-4 py-2.5 text-ink-900" data-label="Method">{METHOD_LABELS[row.method] ?? row.method}</td>
                    <td className="px-4 py-2.5 text-ink-700" data-label="Payments">{row.payments}</td>
                    <td className="px-4 py-2.5 font-medium text-ink-900" data-label="Amount">{money(row.total)}</td>
                  </tr>
                ))}
              </Table>
            </Section>
          </div>

          <Section title="By doctor">
            <Table columns={["Doctor", "Appointments", "Completed", "Cancelled", "Billed"]} empty="No appointments in this period.">
              {data.by_doctor.map((row) => (
                <tr key={row.doctor}>
                  <td className="px-4 py-2.5" data-label="Doctor">
                    <p className="font-medium text-ink-900">{row.doctor}</p>
                    <p className="text-xs text-ink-500">{row.specialization}</p>
                  </td>
                  <td className="px-4 py-2.5 text-ink-700" data-label="Appointments">{row.appointments}</td>
                  <td className="px-4 py-2.5 text-ink-700" data-label="Completed">{row.completed}</td>
                  <td className="px-4 py-2.5 text-ink-700" data-label="Cancelled">{row.cancelled}</td>
                  <td className="px-4 py-2.5 font-medium text-ink-900" data-label="Billed">{money(row.billed)}</td>
                </tr>
              ))}
            </Table>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Most prescribed medicines">
              <Table columns={["Medicine", "Quantity", "Prescriptions"]} empty="No prescriptions in this period.">
                {data.top_medicines.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-2.5 text-ink-900" data-label="Medicine">{row.name}</td>
                    <td className="px-4 py-2.5 text-ink-700" data-label="Quantity">{row.quantity}</td>
                    <td className="px-4 py-2.5 text-ink-700" data-label="Prescriptions">{row.prescriptions}</td>
                  </tr>
                ))}
              </Table>
            </Section>
            <Section title="Most ordered tests">
              <Table columns={["Test", "Orders"]} empty="No tests ordered in this period.">
                {data.top_tests.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-2.5 text-ink-900" data-label="Test">{row.name}</td>
                    <td className="px-4 py-2.5 text-ink-700" data-label="Orders">{row.orders}</td>
                  </tr>
                ))}
              </Table>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
