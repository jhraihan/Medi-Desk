import { useState } from "react";
import { Download } from "lucide-react";
import { downloadPdf } from "../api.js";
import { apiError } from "../errors.js";
import { useToast } from "../toast-context.js";
import Button from "./Button.jsx";

// path is the API path of the PDF, e.g. "prescriptions/12/pdf/".
export default function DownloadPdfButton({ path, filename, label = "PDF", variant = "ghost", size = "sm" }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      await downloadPdf(path, filename);
    } catch (problem) {
      toast.error(apiError(problem, "Could not download the PDF."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size={size} variant={variant} busy={busy} onClick={download}>
      {!busy && <Download size={size === "sm" ? 13 : 14} />} {label}
    </Button>
  );
}
