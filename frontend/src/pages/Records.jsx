import { useCallback, useEffect, useState } from "react";
import { Download, Eye, FilePlus2, FileText, Share2, X } from "lucide-react";
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
import { useFlash } from "../flash.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Loading,
  IconButton,
  Input,
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

function inDays(days) {
  const when = new Date();
  when.setDate(when.getDate() + days);
  return when.toISOString();
}

export default function Records() {
  const { user } = useAuth();
  const isPatient = user?.role === "patient";

  const [documents, setDocuments] = useState([]);
  const [shares, setShares] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [accessLog, setAccessLog] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useFlash();

  const [formIsOpen, setFormIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("lab_report");
  const [documentDate, setDocumentDate] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(() => {
    const wanted = isPatient
      ? [documentsApi.list(), documentSharesApi.list(), doctorsApi.list()]
      : [fetchSharedWithMe(), Promise.resolve([]), Promise.resolve([])];

    return Promise.all(wanted)
      .then(([docs, shareRows, doctorRows]) => {
        setDocuments(docs);
        setShares(shareRows);
        setDoctors(doctorRows);
        setError("");
      })
      .catch(() => setError("Could not load your records."))
      .finally(() => setIsLoading(false));
  }, [isPatient]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(event) {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    setIsSaving(true);
    const form = new FormData();
    form.append("title", title);
    form.append("kind", kind);
    form.append("document_date", documentDate);
    form.append("issued_by", issuedBy);
    form.append("notes", notes);
    form.append("file", file);

    try {
      await uploadDocument(form);
      setNotice("Record uploaded.");
      setFormIsOpen(false);
      setTitle("");
      setDocumentDate("");
      setIssuedBy("");
      setNotes("");
      setFile(null);
      load();
    } catch (problem) {
      const detail = problem.response?.data;
      setError(detail?.file?.[0] || detail?.document_date?.[0] || "Could not upload that file.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleShare(documentId) {
    if (!doctors.length) {
      setError("No doctors available to share with.");
      return;
    }
    const doctor = doctors[0];
    try {
      await shareDocument(documentId, doctor.user, inDays(7));
      setNotice(`Shared with ${doctor.user_details?.first_name ?? "the doctor"} for 7 days.`);
      load();
    } catch (problem) {
      setError(problem.response?.data?.detail || "Could not share this record.");
    }
  }

  async function handleRevoke(shareId) {
    try {
      await documentSharesApi.remove(shareId);
      setNotice("Access revoked.");
      load();
    } catch {
      setError("Could not revoke that share.");
    }
  }

  async function showAccessLog(documentId) {
    try {
      setAccessLog(await fetchDocumentAccessLog(documentId));
    } catch {
      setError("Could not load the access log.");
    }
  }

  const activeShares = shares.filter((share) => share.is_active);

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
            <Button onClick={() => setFormIsOpen(true)}>
              <FilePlus2 size={15} /> Upload a record
            </Button>
          )
        }
      />

      <Alert>{error}</Alert>
      <Alert variant="success">{notice}</Alert>

      {formIsOpen && (
        <Card as="form" tone="strong" onSubmit={handleUpload} className="animate-rise mb-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Upload a record</h2>
            <IconButton onClick={() => setFormIsOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              required
              placeholder="Blood test results"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
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
              value={documentDate}
              onChange={(event) => setDocumentDate(event.target.value)}
            />
            <Input
              label="Issued by"
              placeholder="Lab or hospital name"
              value={issuedBy}
              onChange={(event) => setIssuedBy(event.target.value)}
            />
          </div>

          <div className="mt-4">
            <Textarea
              label="Notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">
              File (PDF, JPG or PNG, up to 10 MB)
            </span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              required
              onChange={(event) => setFile(event.target.files[0])}
              className="w-full rounded-xl border border-brand-200/70 bg-white/80 px-3.5 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
            />
          </label>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Uploading…" : "Upload"}
            </Button>
            <Button variant="secondary" onClick={() => setFormIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

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
                  <p className="truncate text-sm font-medium text-ink-900">
                    {share.document_title}
                  </p>
                  <p className="text-xs text-ink-500">
                    {share.shared_with_name || `User #${share.shared_with}`} · until{" "}
                    {new Date(share.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(share.id)}
                  className="text-xs font-medium text-rose-600 hover:underline"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isLoading && <Loading message="Fetching your records…" />}

      {!isLoading && documents.length === 0 && (
        <EmptyState
          mood="caring"
          title={isPatient ? "No records yet" : "Nothing shared with you"}
          message={
            isPatient
              ? "Upload a prescription or report and it stays here for good."
              : "Records appear here when a patient shares them with you."
          }
        />
      )}

      {documents.length > 0 && (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {documents.map((document) => (
            <Card key={document.id} className="lift flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="rounded-xl bg-brand-50 p-2 text-brand-600">
                  <FileText size={16} />
                </span>
                <Badge tone={KIND_TONES[document.kind] ?? "neutral"}>
                  {KINDS.find((k) => k.value === document.kind)?.label ?? document.kind}
                </Badge>
              </div>

              <p className="font-medium text-ink-900">{document.title}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {new Date(document.document_date).toLocaleDateString()}
                {document.issued_by && ` · ${document.issued_by}`}
              </p>
              {!isPatient && (
                <p className="mt-1 text-xs text-ink-500">{document.patient_name}</p>
              )}
              {document.notes && (
                <p className="mt-2 line-clamp-2 text-sm text-ink-500">{document.notes}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-3 border-t border-white/70 pt-3">
                <button
                  onClick={() => downloadDocument(document.id, document.title)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                >
                  <Download size={13} /> Download
                </button>
                {isPatient && (
                  <>
                    <button
                      onClick={() => handleShare(document.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                    >
                      <Share2 size={13} /> Share
                    </button>
                    <button
                      onClick={() => showAccessLog(document.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:underline"
                    >
                      <Eye size={13} /> Who viewed
                    </button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {accessLog && (
        <Card tone="strong" className="animate-rise mt-5 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Who has viewed this record</h2>
            <IconButton onClick={() => setAccessLog(null)}>
              <X size={16} />
            </IconButton>
          </div>
          {accessLog.length === 0 ? (
            <p className="text-sm text-ink-500">Nobody has opened it yet.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink-700">
              {accessLog.map((entry) => (
                <li key={entry.id}>
                  {entry.viewed_by_name || `User #${entry.viewed_by}`} ·{" "}
                  {new Date(entry.viewed_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
