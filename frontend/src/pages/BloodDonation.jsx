import { useCallback, useState } from "react";
import { Droplet, HeartHandshake, Phone, Plus } from "lucide-react";
import {
  bloodRequestsApi,
  closeBloodRequest,
  donorsApi,
  fetchMyDonorProfile,
  fetchResponders,
  respondToRequest,
} from "../api.js";
import { BLOOD_GROUPS } from "../constants.js";
import { apiError } from "../errors.js";
import { formatDate, formatDateTime } from "../format.js";
import { useLoader } from "../hooks.js";
import { useToast } from "../toast-context.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chips,
  ConfirmDialog,
  EmptyState,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
  StatTile,
  Textarea,
} from "../components/index.js";

const DISTRICTS = [
  "Dhaka", "Chattogram", "Khulna", "Rajshahi", "Sylhet",
  "Barishal", "Rangpur", "Mymensingh", "Comilla", "Gazipur",
];

const URGENCY_TONES = { routine: "neutral", urgent: "warning", critical: "danger" };

const VIEWS = [
  { value: "all", label: "All requests" },
  { value: "mine", label: "My requests" },
  { value: "open", label: "I can help" },
];

const loadAll = async () => {
  const [profile, requests] = await Promise.all([fetchMyDonorProfile(), bloodRequestsApi.list()]);
  return { donor: profile?.donor === null ? null : profile, requests };
};

export default function BloodDonation() {
  const toast = useToast();
  const { data, error, isLoading, reload } = useLoader(loadAll, "Could not load the donor network.");

  const [view, setView] = useState("all");
  const [donorFormOpen, setDonorFormOpen] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [respondersFor, setRespondersFor] = useState(null);
  const [closing, setClosing] = useState(null);
  const [workingId, setWorkingId] = useState(null);

  const donor = data?.donor;
  const requests = data?.requests ?? [];
  const shown = requests.filter((request) =>
    view === "mine" ? request.is_mine : view === "open" ? !request.is_mine && !request.my_reply : true,
  );

  async function toggleAvailability() {
    setWorkingId("donor");
    try {
      await donorsApi.patch(donor.id, { is_available: !donor.is_available });
      toast.success(donor.is_available ? "You are now hidden from searches." : "You are visible to requests again.");
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not update your availability."));
    } finally {
      setWorkingId(null);
    }
  }

  async function reply(request, answer) {
    setWorkingId(request.id);
    try {
      await respondToRequest(request.id, answer);
      toast.success(answer === "yes" ? "Thank you. The requester can now see your number and call you." : "Response saved.");
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not send your response."));
    } finally {
      setWorkingId(null);
    }
  }

  async function confirmClose() {
    setWorkingId(closing.id);
    try {
      await closeBloodRequest(closing.id);
      toast.success("Request closed. Donors won't be asked any more.");
      setClosing(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not close that request."));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Blood donation"
        title="Donor network"
        subtitle="Post an urgent need, or offer to donate when someone nearby matches you."
        action={
          <Button onClick={() => setRequestFormOpen(true)}>
            <Plus size={15} /> Request blood
          </Button>
        }
      />

      <Alert onRetry={reload}>{error}</Alert>

      {data && !donor && (
        <Card tone="tinted" className="animate-rise mb-5 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-lg font-semibold">Become a donor</p>
            <p className="text-sm text-white/75">Your phone number stays hidden until you accept a request.</p>
          </div>
          <button
            type="button"
            onClick={() => setDonorFormOpen(true)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-brand-700 transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Register as a donor
          </button>
        </Card>
      )}

      {donor && (
        <div className="stagger mb-5 grid gap-4 sm:grid-cols-3">
          <StatTile label="Your blood group" value={donor.blood_group} icon={Droplet} />
          <StatTile
            label="Status"
            value={donor.can_donate ? "Ready to donate" : "In cooldown"}
            hint={donor.available_from ? `Available from ${formatDate(donor.available_from)}` : undefined}
            icon={HeartHandshake}
            tone={donor.can_donate ? "glass" : "tinted"}
          />
          <Card className="lift flex flex-col justify-between p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Visibility</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Badge tone={donor.is_available ? "success" : "neutral"}>
                {donor.is_available ? "Visible" : "Hidden"}
              </Badge>
              <Button size="sm" variant="ghost" busy={workingId === "donor"} onClick={toggleAvailability}>
                {donor.is_available ? "Hide me" : "Show me"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {requests.length > 0 && (
        <div className="mb-4">
          <Chips label="Show" options={VIEWS} value={view} onChange={setView} />
        </div>
      )}

      {isLoading && !data && <Loading message="Loading the donor network…" />}

      {data && shown.length === 0 && (
        <EmptyState
          mood="caring"
          title={requests.length ? "Nothing in this view" : "No open requests"}
          message={
            requests.length
              ? "Try another filter above."
              : "When someone nearby needs blood you can give, it appears here."
          }
        />
      )}

      {shown.length > 0 && (
        <div className="stagger grid gap-4 md:grid-cols-2">
          {shown.map((request) => (
            <Card key={request.id} className="lift flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-lg font-bold text-rose-600">
                    {request.blood_group}
                  </span>
                  <div>
                    <p className="font-medium text-ink-900">{request.hospital}</p>
                    <p className="text-xs text-ink-500">
                      {request.district} · {request.units} unit{request.units === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={URGENCY_TONES[request.urgency]}>{request.urgency}</Badge>
                  {request.status !== "open" && <Badge>{request.status}</Badge>}
                </div>
              </div>

              <p className="text-xs text-ink-500">Needed by {formatDateTime(request.needed_by)}</p>
              {request.note && <p className="mt-2 text-sm text-ink-500">{request.note}</p>}

              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-white/70 pt-3">
                {request.is_mine ? (
                  <>
                    <span className="mr-auto text-xs text-ink-500">
                      {request.accepted_count} donor{request.accepted_count === 1 ? "" : "s"} offered
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setRespondersFor(request)}>
                      See who can help
                    </Button>
                    {request.status === "open" && (
                      <Button size="sm" variant="secondary" onClick={() => setClosing(request)}>
                        Close
                      </Button>
                    )}
                  </>
                ) : request.my_reply ? (
                  <Badge tone={request.my_reply === "yes" ? "success" : "neutral"}>
                    {request.my_reply === "yes" ? "You offered to help" : "You declined"}
                  </Badge>
                ) : (
                  <>
                    <Button size="sm" busy={workingId === request.id} onClick={() => reply(request, "yes")}>
                      I can donate
                    </Button>
                    <Button size="sm" variant="ghost" disabled={workingId === request.id} onClick={() => reply(request, "no")}>
                      Not this time
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {donorFormOpen && (
        <DonorModal
          onClose={() => setDonorFormOpen(false)}
          onSaved={() => {
            setDonorFormOpen(false);
            toast.success("You are registered as a donor. Thank you.");
            reload();
          }}
        />
      )}

      {requestFormOpen && (
        <RequestModal
          onClose={() => setRequestFormOpen(false)}
          onSaved={() => {
            setRequestFormOpen(false);
            setView("mine");
            toast.success("Request posted. Matching donors have been notified.");
            reload();
          }}
        />
      )}

      {respondersFor && <RespondersModal request={respondersFor} onClose={() => setRespondersFor(null)} />}

      <ConfirmDialog
        open={Boolean(closing)}
        tone="primary"
        title="Close this request?"
        message="Mark it fulfilled once you have the blood you need. Donors stop seeing it."
        confirmLabel="Close request"
        workingLabel="Closing…"
        isWorking={workingId === closing?.id}
        onConfirm={confirmClose}
        onCancel={() => setClosing(null)}
      />
    </>
  );
}

function DonorModal({ onClose, onSaved }) {
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [district, setDistrict] = useState("Dhaka");
  const [area, setArea] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      await donorsApi.create({ blood_group: bloodGroup, district, area, phone });
      onSaved();
    } catch (problem) {
      setError(apiError(problem, "Could not register you as a donor."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Register as a donor"
      subtitle="We only share your number with someone whose request you accept."
      error={error}
      busy={isSaving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" busy={isSaving}>
            {isSaving ? "Saving…" : "Register"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Blood group" value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)}>
          {BLOOD_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </Select>
        <Select label="District" value={district} onChange={(event) => setDistrict(event.target.value)}>
          {DISTRICTS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <Input label="Area" placeholder="Mirpur" value={area} onChange={(event) => setArea(event.target.value)} />
        <Input label="Phone" type="tel" required placeholder="01712345678" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </div>
    </Modal>
  );
}

function RequestModal({ onClose, onSaved }) {
  const [needGroup, setNeedGroup] = useState("O+");
  const [units, setUnits] = useState("1");
  const [hospital, setHospital] = useState("");
  const [district, setDistrict] = useState("Dhaka");
  const [neededBy, setNeededBy] = useState("");
  const [urgency, setUrgency] = useState("urgent");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      await bloodRequestsApi.create({
        blood_group: needGroup,
        units: Number(units),
        hospital,
        district,
        needed_by: new Date(neededBy).toISOString(),
        urgency,
        note,
      });
      onSaved();
    } catch (problem) {
      setError(apiError(problem, "Could not post that request."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title="Request blood"
      subtitle="Registered donors with a matching group in that district are told straight away."
      error={error}
      busy={isSaving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" busy={isSaving}>
            {isSaving ? "Posting…" : "Post request"}
          </Button>
        </>
      }
    >
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-sm font-medium text-ink-700">Blood group needed</legend>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {BLOOD_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              aria-pressed={needGroup === group}
              onClick={() => setNeedGroup(group)}
              className={`rounded-xl py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                needGroup === group ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              {group}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Units" type="number" min="1" max="10" required value={units} onChange={(event) => setUnits(event.target.value)} />
        <Select label="Urgency" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
          <option value="routine">Routine</option>
          <option value="urgent">Urgent</option>
          <option value="critical">Critical</option>
        </Select>
        <Input label="Needed by" type="datetime-local" required value={neededBy} onChange={(event) => setNeededBy(event.target.value)} />
        <div className="sm:col-span-2">
          <Input
            label="Hospital"
            required
            placeholder="Dhaka Medical College Hospital"
            value={hospital}
            onChange={(event) => setHospital(event.target.value)}
          />
        </div>
        <Select label="District" value={district} onChange={(event) => setDistrict(event.target.value)}>
          {DISTRICTS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-4">
        <Textarea label="Note" rows={2} placeholder="Ward, patient name, who to ask for" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
    </Modal>
  );
}

function RespondersModal({ request, onClose }) {
  const load = useCallback(() => fetchResponders(request.id), [request.id]);
  const { data, error, isLoading } = useLoader(load, "Could not load the responders.");

  return (
    <Modal
      open
      title="Donors who can help"
      subtitle={`${request.blood_group} · ${request.hospital}`}
      onClose={onClose}
    >
      <Alert>{error}</Alert>
      {isLoading && <Loading message="Checking…" />}
      {data && data.length === 0 && <p className="text-sm text-ink-500">Nobody has offered yet. Donors are still being asked.</p>}
      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50/60 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-ink-900">
                  {entry.donor_name || "A donor"} · {entry.blood_group}
                </p>
                <p className="text-xs text-ink-500">Offered {formatDateTime(entry.responded_at)}</p>
              </div>
              {entry.donor_phone && (
                <a
                  href={`tel:${entry.donor_phone}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Phone size={14} /> {entry.donor_phone}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
