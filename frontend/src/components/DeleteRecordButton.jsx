import { useState } from "react";
import { Trash2 } from "lucide-react";
import { apiError } from "../errors.js";
import { useToast } from "../toast-context.js";
import Button from "./Button.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

/**
 * A delete button with its own "are you sure?" step. Callers decide who sees it;
 * deletes of clinical and billing records are offered to admins only.
 */
export default function DeleteRecordButton({
  title,
  message,
  onDelete,
  onDeleted,
  success = "Deleted.",
  label = "Delete",
  size = "sm",
  variant = "danger-ghost",
  className = "",
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  async function confirm() {
    setIsWorking(true);
    try {
      await onDelete();
      toast.success(success);
      setOpen(false);
      onDeleted?.();
    } catch (problem) {
      toast.error(apiError(problem, "Could not delete that."));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 size={13} /> {label}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        confirmLabel="Delete"
        isWorking={isWorking}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
