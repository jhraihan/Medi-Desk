import Button from "./Button.jsx";

export default function ConfirmDialog({
  open,
  title,
  message,
  isWorking,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isWorking}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isWorking}>
            {isWorking ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
