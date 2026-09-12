import { useCallback, useEffect, useState } from "react";
import { Droplet, HeartHandshake, Phone, Plus, X } from "lucide-react";
import {
  bloodRequestsApi,
  closeBloodRequest,
  donorsApi,
  fetchMyDonorProfile,
  fetchResponders,
  respondToRequest,
} from "../api.js";
import { useFlash } from "../flash.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  Select,
  StatTile,
  Textarea,
} from "../components/index.js";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const DISTRICTS = [
  "Dhaka", "Chattogram", "Khulna", "Rajshahi", "Sylhet",
  "Barishal", "Rangpur", "Mymensingh", "Comilla", "Gazipur",
];

const URGENCY_TONES = { routine: "neutral", urgent: "warning", critical: "danger" };

export default function BloodDonation() {
  const [donor, setDonor] = useState(null);
  const [requests, setRequests] = useState([]);
  const [responders, setResponders] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  const [donorFormOpen, setDonorFormOpen] = useState(false);
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [district, setDistrict] = useState("Dhaka");
  const [area, setArea] = useState("");
  const [phone, setPhone] = useState("");

  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [needGroup, setNeedGroup] = useState("O+");
  const [units, setUnits] = useState(1);
  const [hospital, setHospital] = useState("");
  const [needDistrict, setNeedDistrict] = useState("Dhaka");
  const [neededBy, setNeededBy] = useState("");
  const [urgency, setUrgency] = useState("urgent");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(() => {
    return Promise.all([fetchMyDonorProfile(), bloodRequestsApi.list()])
      .then(([profile, rows]) => {
        setDonor(profile?.donor === null ? null : profile);
        setRequests(rows);
        setError("");
      })
      .catch(() => setError("Could not load the donor network."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function registerDonor(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await donorsApi.create({
        blood_group: bloodGroup,
        district,
        area,
        phone,
      });
      setNotice("You are registered as a donor. Thank you.");
      setDonorFormOpen(false);
      load();
    } catch (problem) {
      setError(problem.response?.data?.detail || "Could not register you as a donor.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleAvailability() {
    try {
      await donorsApi.patch(donor.id, { is_available: !donor.is_available });
      setNotice(donor.is_available ? "You are now hidden from searches." : "You are visible again.");
      load();
    } catch {
      setError("Could not update your availability.");
    }
  }

  async function createRequest(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await bloodRequestsApi.create({
        blood_group: needGroup,
        units: Number(units),
        hospital,
        district: needDistrict,
        needed_by: new Date(neededBy).toISOString(),
        urgency,
        note,
      });
      setNotice("Request posted. Matching donors have been notified.");
      setRequestFormOpen(false);
      setHospital("");
      setNeededBy("");
      setNote("");
      load();
    } catch (problem) {
      const data = problem.response?.data;
      setError(data?.needed_by?.[0] || data?.detail || "Could not post that request.");
    } finally {
      setIsSaving(false);
    }
  }

  async function reply(requestId, answer) {
    try {
      await respondToRequest(requestId, answer);
      setNotice(answer === "yes" ? "Thank you. The requester can now contact you." : "Response saved.");
      load();
    } catch (problem) {
      setError(problem.response?.data?.detail || "Could not send your response.");
    }
  }

  async function showResponders(requestId) {
    try {
      setResponders(await fetchResponders(requestId));
    } catch {
      setError("Could not load the responders.");
    }
  }

  async function close(requestId) {
    try {
      await closeBloodRequest(requestId);
      setNotice("Request closed.");
      load();
    } catch {
      setError("Could not close that request.");
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

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      {!isLoading && !donor && !donorFormOpen && (
        <Card tone="tinted" className="animate-rise mb-5 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-lg font-semibold">Become a donor</p>
            <p className="text-sm text-white/75">
              Your phone number stays hidden until you accept a request.
            </p>
          </div>
          <button
            onClick={() => setDonorFormOpen(true)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-brand-700 transition-transform duration-200 hover:scale-[1.02]"
          >
            Register as a donor
          </button>
        </Card>
      )}

      {donorFormOpen && (
        <Card as="form" tone="strong" onSubmit={registerDonor} className="animate-rise mb-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Register as a donor</h2>
            <IconButton onClick={() => setDonorFormOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="Blood group" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </Select>
            <Select label="District" value={district} onChange={(e) => setDistrict(e.target.value)}>
              {DISTRICTS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
            <Input label="Area" placeholder="Mirpur" value={area} onChange={(e) => setArea(e.target.value)} />
            <Input
              label="Phone"
              required
              placeholder="01712345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Register"}
            </Button>
            <Button variant="secondary" onClick={() => setDonorFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {donor && (
        <div className="stagger mb-5 grid gap-4 sm:grid-cols-3">
          <StatTile label="Your blood group" value={donor.blood_group} icon={Droplet} />
          <StatTile
            label="Status"
            value={donor.can_donate ? "Ready to donate" : "In cooldown"}
            hint={donor.available_from ? `Available from ${new Date(donor.available_from).toLocaleDateString()}` : undefined}
            icon={HeartHandshake}
            tone={donor.can_donate ? "glass" : "tinted"}
          />
          <Card className="lift flex flex-col justify-between p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Visibility</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Badge tone={donor.is_available ? "success" : "neutral"}>
                {donor.is_available ? "Visible" : "Hidden"}
              </Badge>
              <button
                onClick={toggleAvailability}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                {donor.is_available ? "Hide me" : "Show me"}
              </button>
            </div>
          </Card>
        </div>
      )}

      {requestFormOpen && (
        <Card as="form" tone="strong" onSubmit={createRequest} className="animate-rise mb-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Request blood</h2>
            <IconButton onClick={() => setRequestFormOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="Blood group needed" value={needGroup} onChange={(e) => setNeedGroup(e.target.value)}>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </Select>
            <Input
              label="Units"
              type="number"
              min="1"
              max="10"
              required
              value={units}
              onChange={(e) => setUnits(e.target.value)}
            />
            <Select label="Urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="critical">Critical</option>
            </Select>
            <Input
              label="Hospital"
              required
              placeholder="Dhaka Medical College Hospital"
              value={hospital}
              onChange={(e) => setHospital(e.target.value)}
            />
            <Select label="District" value={needDistrict} onChange={(e) => setNeedDistrict(e.target.value)}>
              {DISTRICTS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
            <Input
              label="Needed by"
              type="datetime-local"
              required
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Posting…" : "Post request"}
            </Button>
            <Button variant="secondary" onClick={() => setRequestFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {isLoading && <p className="text-sm text-ink-500">Loading…</p>}

      {!isLoading && requests.length === 0 && (
        <EmptyState
          icon={Droplet}
          title="No open requests"
          message="When someone nearby needs blood you can give, it appears here."
        />
      )}

      {requests.length > 0 && (
        <div className="stagger grid gap-4 md:grid-cols-2">
          {requests.map((request) => (
            <Card key={request.id} className="lift p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-lg font-bold text-rose-600">
                    {request.blood_group}
                  </span>
                  <div>
                    <p className="font-medium text-ink-900">{request.hospital}</p>
                    <p className="text-xs text-ink-500">
                      {request.district} · {request.units} unit(s)
                    </p>
                  </div>
                </div>
                <Badge tone={URGENCY_TONES[request.urgency]}>{request.urgency}</Badge>
              </div>

              <p className="text-xs text-ink-500">
                Needed by {new Date(request.needed_by).toLocaleString()}
              </p>
              {request.note && <p className="mt-2 text-sm text-ink-500">{request.note}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/70 pt-3">
                {request.is_mine ? (
                  <>
                    <span className="text-xs text-ink-500">
                      {request.accepted_count} donor(s) offered
                    </span>
                    <button
                      onClick={() => showResponders(request.id)}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      See who can help
                    </button>
                    {request.status === "open" && (
                      <button
                        onClick={() => close(request.id)}
                        className="text-xs font-medium text-ink-500 hover:underline"
                      >
                        Close
                      </button>
                    )}
                  </>
                ) : request.my_reply ? (
                  <Badge tone={request.my_reply === "yes" ? "success" : "neutral"}>
                    {request.my_reply === "yes" ? "You offered to help" : "You declined"}
                  </Badge>
                ) : (
                  <>
                    <Button variant="primary" onClick={() => reply(request.id, "yes")}>
                      I can donate
                    </Button>
                    <button
                      onClick={() => reply(request.id, "no")}
                      className="text-xs font-medium text-ink-500 hover:underline"
                    >
                      Not this time
                    </button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {responders && (
        <Card tone="strong" className="animate-rise mt-5 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Donors who can help</h2>
            <IconButton onClick={() => setResponders(null)}>
              <X size={16} />
            </IconButton>
          </div>

          {responders.length === 0 ? (
            <p className="text-sm text-ink-500">Nobody has offered yet.</p>
          ) : (
            <div className="space-y-2">
              {responders.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {entry.donor_name || "A donor"} · {entry.blood_group}
                    </p>
                    <p className="text-xs text-ink-500">
                      Offered {new Date(entry.responded_at).toLocaleString()}
                    </p>
                  </div>
                  {entry.donor_phone && (
                    <a
                      href={`tel:${entry.donor_phone}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
                    >
                      <Phone size={14} /> {entry.donor_phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
