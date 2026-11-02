import { useCallback, useState } from "react";
import { Download, Eye, FilePlus2, FileText, Share2, UploadCloud } from "lucide-react";
import {
  doctorsApi,
  documentSharesApi,
  documentsApi,
  downloadDocument,
  fetchDocumentAccessLog,
  fetchSharedWithMe,
  shareDocument,
  uploadDocument,
} from "../api.js";
import { useAuth } from "../auth-context.js";
import { apiError } from "../errors.js";
import { formatDate, formatDateTime, localISODate } from "../format.js";
import { useLoader } from "../hooks.js";
import { doctorLabel } from "../pickers.js";
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
  Textarea,
} from "../components/index.js";

const KINDS = [
  { value: "prescription", label: "Prescription" },
  { value: "lab_report", label: "Lab report" },
  { value: "scan", label: "Scan or imaging" },
  { value: "discharge", label: "Discharge summary" },
  { value: "other", label: "Other" },
];

const KIND_TONES = {
  prescription: "brand",
  lab_report: "success",
  scan: "warning",
  discharge: "neutral",
  other: "neutral",
};

const SHARE_DAYS = [
  { value: "1", label: "1 day" },
  { value: "7", label: "1 week" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

// Matches the API's upload limit (MAX_UPLOAD_BYTES in settings.py).
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = [".pdf", ".jpg", ".jpeg", ".png"];

function inDays(days) {
  const when = new Date();
  when.setDate(when.getDate() + days);
  return when.toISOString();
}

function sizeLabel(bytes) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Records() {
  const { user } = useAuth();
  const toast = useToast();
  const isPatient = user?.role === "patient";

  const [kind, setKind] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [accessLogFor, setAccessLogFor] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [isWorking, setIsWorking] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback(async () => {
    if (!isPatient) return { documents: await fetchSharedWithMe(), shares: [], doctors: [] };
    const [documents, shares, doctors] = await Promise.all([
      documentsApi.listAll(),
      documentSharesApi.listAll(),
      doctorsApi.listAll(),
    ]);
    return { documents, shares, doctors };
  }, [isPatient]);
  const { data, error, isLoading, reload } = useLoader(load, "Could not load your records.");

  const documents = data?.documents ?? [];
  const shown = kind ? documents.filter((document) => document.kind === kind) : documents;
  const activeShares = (data?.shares ?? []).filter((share) => share.is_active);
  const kindOptions = [
    { value: "", label: "All", count: documents.length },
    ...KINDS.map((option) => ({
      ...option,
      count: documents.filter((document) => document.kind === option.value).length,
    })).filter((option) => option.count > 0),
  ];

  async function download(document) {
    setDownloadingId(document.id);
    try {
      await downloadDocument(document.id, document.title);
    } catch (problem) {
      toast.error(apiError(problem, "Could not download that record."));
    } finally {
      setDownloadingId(null);
    }
  }

  async function confirmRevoke() {
    setIsWorking(true);
    try {
      await documentSharesApi.remove(revoking.id);
      toast.success(`${revoking.shared_with_name || "The doctor"} can no longer see “${revoking.document_title}”.`);
      setRevoking(null);
      reload();
    } catch (problem) {
      toast.error(apiError(problem, "Could not revoke that share."));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Medical records"
        title={isPatient ? "Your health records" : "Records shared with you"}
        subtitle={
          isPatient
            ? "Keep prescriptions and reports in one place, and choose who can see them."
            : "Records a patient has chosen to share, until the share expires."
        }
        action={
          isPatient && (
            <Button onClick={() => setUploadOpen(true)}>
              <FilePlus2 size={15} /> Upload a record
            </Button>
          )
        }
      />

      <Alert onRetry={reload}>{error}</Alert>

      {isPatient && activeShares.length > 0 && (
        <Card className="animate-rise mb-5 p-5">
          <h2 className="mb-3 font-semibold text-ink-900">Who can see your records</h2>
          <div className="space-y-2">
            {activeShares.map((share) => (
              <div
                key={share.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{share.document_title}</p>
                  <p className="text-xs text-ink-500">
                    {share.shared_with_name || `User #${share.shared_with}`} · until {formatDate(share.expires_at)}
                  </p>
                </div>
                <Button size="sm" variant="danger-ghost" onClick={() => setRevoking(share)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {documents.length > 1 && (
        <div className="mb-4">
          <Chips label="Record type" options={kindOptions} value={kind} onChange={setKind} />
        </div>
      )}

      {isLoading && !data && <Loading message="Fetching your records…" />}

      {data && documents.length === 0 && (
        <EmptyState
          mood="caring"
          title={isPatient ? "No records yet" : "Nothing shared with you"}
          message={
            isPatient
              ? "Upload a prescription or report and it stays here for good."
              : "Records appear here when a patient shares them with you."
          }
          action={
            isPatient && (
              <Button onClick={() => setUploadOpen(true)}>
                <FilePlus2 size={15} /> Upload your first record
              </Button>
            )
          }
        />
      )}

      {shown.length > 0 && (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((document) => (
            <Card key={document.id} className="lift flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="rounded-xl bg-brand-50 p-2 text-brand-600">
                  <FileText size={16} />
                </span>
                <Badge tone={KIND_TONES[document.kind]}>
                  {KINDS.find((option) => option.value === document.kind)?.label ?? document.kind}
                </Badge>
              </div>

              <p className="font-medium text-ink-900">{document.title}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {formatDate(document.document_date)}
                {document.issued_by && ` · ${document.issued_by}`}
              </p>
              {!isPatient && <p className="mt-1 text-xs font-medium text-ink-700">{document.patient_name}</p>}
              {document.notes && <p className="mt-2 line-clamp-2 text-sm text-ink-500">{document.notes}</p>}

              <div className="mt-auto flex flex-wrap gap-1.5 border-t border-white/70 pt-3">
                <Button size="sm" variant="ghost" busy={downloadingId === document.id} onClick={() => download(document)}>
                  {downloadingId !== document.id && <Download size={13} />} Download
                </Button>
                {isPatient && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setSharing(document)}>
                      <Share2 size={13} /> Share
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAccessLogFor(document)}>
                      <Eye size={13} /> Who viewed
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSaved={(title) => {
            setUploadOpen(false);
            toast.success(`“${title}” uploaded.`);
            reload();
          }}
        />
      )}

      {sharing && (
        <ShareModal
          document={sharing}
          doctors={data?.doctors ?? []}
          onClose={() => setSharing(null)}
          onShared={(message) => {
            setSharing(null);
            toast.success(message);
            reload();
          }}
        />
      )}

      {accessLogFor && <AccessLogModal document={accessLogFor} onClose={() => setAccessLogFor(null)} />}

      <ConfirmDialog
        open={Boolean(revoking)}
        title="Stop sharing this record?"
        message={
          revoking &&
          `${revoking.shared_with_name || "The doctor"} will no longer be able to open “${revoking.document_title}”.`
        }
        confirmLabel="Revoke access"
        workingLabel="Revoking…"
        isWorking={isWorking}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
      />
    </>
  );
}

function UploadModal({ onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("lab_report");
  const [documentDate, setDocumentDate] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function pick(chosen) {
    if (!chosen) return;
    const extension = chosen.name.slice(chosen.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED.includes(extension)) {
      setError("Only PDF, JPG or PNG files can be uploaded.");
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError(`That file is ${sizeLabel(chosen.size)}. The limit is 10 MB.`);
      return;
    }
    setError("");
    setFile(chosen);
    // Name the record after the file when the title is still empty.
    if (!title) setTitle(chosen.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) return setError("Choose a file to upload.");

    setIsSaving(true);
    setError("");
    const form = new FormData();
    form.append("title", title);
    form.append("kind", kind);
    form.append("document_date", documentDate);
    form.append("issued_by", issuedBy);
    form.append("notes", notes);
    form.append("file", file);

    try {
      await uploadDocument(form);
      onSaved(title);
    } catch (problem) {
      setError(apiError(problem, "Could not upload that file."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title="Upload a record"
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
            {isSaving ? "Uploading…" : "Upload"}
          </Button>
        </>
      }
    >
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files[0]);
        }}
        className={`mb-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:border-brand-500 ${
          dragging ? "border-brand-500 bg-brand-50" : file ? "border-emerald-300 bg-emerald-50/60" : "border-brand-200 bg-brand-50/40 hover:bg-brand-50"
        }`}
      >
        <UploadCloud size={28} className={file ? "text-emerald-600" : "text-brand-600"} />
        {file ? (
          <>
            <p className="mt-2 text-sm font-medium text-ink-900">{file.name}</p>
            <p className="text-xs text-ink-500">{sizeLabel(file.size)} · click to choose a different file</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium text-ink-900">Drop a file here, or click to choose</p>
            <p className="text-xs text-ink-500">PDF, JPG or PNG, up to 10 MB</p>
          </>
        )}
        <input
          type="file"
          accept={ACCEPTED.join(",")}
          onChange={(event) => pick(event.target.files[0])}
          className="sr-only"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" required placeholder="Blood test results" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Select label="Type" value={kind} onChange={(event) => setKind(event.target.value)}>
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Input
          label="Date on the document"
          type="date"
          required
          max={localISODate()}
          value={documentDate}
          onChange={(event) => setDocumentDate(event.target.value)}
        />
        <Input label="Issued by" placeholder="Lab or hospital name" value={issuedBy} onChange={(event) => setIssuedBy(event.target.value)} />
      </div>
      <div className="mt-4">
        <Textarea label="Notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
    </Modal>
  );
}

function ShareModal({ document, doctors, onClose, onShared }) {
  const [doctorId, setDoctorId] = useState("");
  const [days, setDays] = useState("7");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const doctor = doctors.find((row) => String(row.id) === doctorId);
    if (!doctor) return setError("Choose a doctor to share with.");

    setIsSaving(true);
    setError("");
    try {
      await shareDocument(document.id, doctor.user, inDays(Number(days)));
      const span = SHARE_DAYS.find((option) => option.value === days)?.label;
      onShared(`${doctorLabel(doctor)} can open “${document.title}” for ${span}.`);
    } catch (problem) {
      setError(apiError(problem, "Could not share this record."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Share with a doctor"
      subtitle={`“${document.title}”`}
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
            {isSaving ? "Sharing…" : "Share"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Doctor"
          required
          placeholder={doctors.length ? "Choose a doctor" : "No doctors to choose from"}
          value={doctorId}
          onChange={(event) => setDoctorId(event.target.value)}
        >
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctorLabel(doctor)} · {doctor.specialization}
            </option>
          ))}
        </Select>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-700">For how long</legend>
          <Chips label="For how long" options={SHARE_DAYS} value={days} onChange={setDays} />
        </fieldset>
        <p className="text-xs text-ink-500">
          Access ends by itself after that. You can revoke it sooner, and see each time it was opened.
        </p>
      </div>
    </Modal>
  );
}

function AccessLogModal({ document, onClose }) {
  const load = useCallback(() => fetchDocumentAccessLog(document.id), [document.id]);
  const { data, error, isLoading } = useLoader(load, "Could not load the access log.");

  return (
    <Modal open title="Who has opened this record" subtitle={`“${document.title}”`} onClose={onClose}>
      <Alert>{error}</Alert>
      {isLoading && <Loading message="Checking…" />}
      {data && data.length === 0 && <p className="text-sm text-ink-500">Nobody has opened it yet.</p>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-brand-100 text-sm">
          {data.map((entry) => (
            <li key={entry.id} className="flex justify-between gap-3 py-2">
              <span className="font-medium text-ink-900">{entry.viewed_by_name || `User #${entry.viewed_by}`}</span>
              <span className="text-ink-500">{formatDateTime(entry.viewed_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
