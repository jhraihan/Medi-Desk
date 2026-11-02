import Button from "./Button.jsx";
import Modal from "./Modal.jsx";

export default function ConfirmDialog({
  open,
  title,
  message,
  isWorking,
  onConfirm,
  onCancel,
  confirmLabel = "Delete",
  workingLabel = "Deleting...",
  tone = "danger",
  children,
}) {
  return (
    <Modal
      open={open}
      title={title}
      size="sm"
      busy={isWorking}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isWorking}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            busy={isWorking}
            data-autofocus
          >
            {isWorking ? workingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="text-sm text-ink-700">{message}</p>}
      {children}
    </Modal>
  );
}
