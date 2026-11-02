import { useEffect, useState } from "react";
import { auditLogsApi, fetchAuditModels } from "../../api.js";
import { apiError } from "../../errors.js";
import { formatDateTime } from "../../format.js";
import { useDebounced } from "../../hooks.js";
import { Alert, Badge, Card, EmptyState, Input, Pager, SearchInput, Select, Table } from "../../components/index.js";
import { ACTION_TONES, describeChange } from "./audit-format.js";

const ACTIONS = ["create", "update", "delete", "read"];

export default function AuditLog() {
  const [models, setModels] = useState([]);
  const [filters, setFilters] = useState({ action: "", target_model: "", since: "", until: "" });
  const [search, setSearch] = useState("");
  const settledSearch = useDebounced(search);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ count: 0, results: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAuditModels().then(setModels).catch(() => setModels([]));
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setIsLoading(true);
        const params = { page };
        for (const [key, value] of Object.entries({ ...filters, search: settledSearch })) {
          if (value) params[key] = value;
        }
        const rows = await auditLogsApi.listPage(params);
        if (!active) return;
        setData(rows);
        setError("");
      } catch (problem) {
        if (active) setError(apiError(problem, "Could not load the audit log."));
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [page, filters, settledSearch]);

  function filterBy(key) {
    return (event) => {
      setFilters((current) => ({ ...current, [key]: event.target.value }));
      setPage(1);
    };
  }

  return (
    <div className="animate-fade">
      <Alert>{error}</Alert>

      <p className="mb-4 text-sm text-ink-500">
        Every change to patient, billing, pharmacy and staff records, plus each time a single patient record,
        prescription or document is opened. Entries name the fields that changed, never their values.
      </p>

      <Card className="mb-5 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput
          label="Search"
          placeholder="Username or record id"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <Select label="Action" placeholder="Any action" value={filters.action} onChange={filterBy("action")}>
          {ACTIONS.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </Select>
        <Select label="Record type" placeholder="Any type" value={filters.target_model} onChange={filterBy("target_model")}>
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </Select>
        <Input label="From" type="date" value={filters.since} onChange={filterBy("since")} />
        <Input label="To" type="date" value={filters.until} onChange={filterBy("until")} />
      </Card>

      <h2 className="mb-3 font-semibold text-ink-900">{isLoading ? "Loading..." : `${data.count} entries`}</h2>

      {!isLoading && data.count === 0 ? (
        <EmptyState title="Nothing matches" message="Try a wider date range or fewer filters." />
      ) : (
        <Table columns={["When", "Who", "Action", "Record", "From"]} isLoading={isLoading}>
          {data.results.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3 whitespace-nowrap text-ink-500">{formatDateTime(entry.created_at)}</td>
              <td className="px-4 py-3">
                <p className="text-ink-900">{entry.actor_username ?? "system"}</p>
                {entry.actor_role && <p className="text-xs capitalize text-ink-500">{entry.actor_role}</p>}
              </td>
              <td className="px-4 py-3">
                <Badge tone={ACTION_TONES[entry.action]}>{entry.action}</Badge>
              </td>
              <td className="px-4 py-3 text-ink-700">{describeChange(entry)}</td>
              <td className="px-4 py-3 text-xs text-ink-500">{entry.ip_address ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} count={data.count} onChange={setPage} />
    </div>
  );
}
