import { useState } from "react";
import { changePassword } from "../api.js";
import { apiError } from "../errors.js";
import { useToast } from "../toast-context.js";
import Button from "./Button.jsx";
import Input from "./Input.jsx";
import Modal from "./Modal.jsx";

export default function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const mismatch = confirm && confirm !== next ? "The two passwords don't match." : "";

  function close() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setFieldErrors({});
    setError("");
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (mismatch) return;
    setError("");
    setFieldErrors({});
    setIsSaving(true);
    try {
      await changePassword(current, next);
      toast.success("Password changed. Any other devices have been signed out.");
      close();
    } catch (problem) {
      const data = problem.response?.data ?? {};
      setFieldErrors({
        current: [].concat(data.current_password ?? []).join(" "),
        next: [].concat(data.new_password ?? []).join(" "),
      });
      if (!data.current_password && !data.new_password) setError(apiError(problem, "Could not change your password."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      size="sm"
      title="Change your password"
      subtitle="You stay signed in here. Every other device is signed out."
      error={error}
      busy={isSaving}
      onClose={close}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" busy={isSaving}>
            {isSaving ? "Saving…" : "Change password"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Current password"
          type="password"
          required
          autoComplete="current-password"
          error={fieldErrors.current}
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <Input
          label="New password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          hint="At least 8 characters, not all numbers, and not like your name."
          error={fieldErrors.next}
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <Input
          label="Repeat new password"
          type="password"
          required
          autoComplete="new-password"
          error={mismatch}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>
    </Modal>
  );
}
