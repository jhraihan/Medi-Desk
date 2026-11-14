import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Activity } from "lucide-react";
import { confirmPasswordReset } from "../api.js";
import { apiError } from "../errors.js";
import { Alert, Button, Input, Mascot } from "../components/index.js";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState(uid && token ? "" : "This link is incomplete. Open it again from your email.");
  const [isSaving, setIsSaving] = useState(false);

  const mismatch = confirm && confirm !== password ? "The two passwords don't match." : "";

  async function handleSubmit(event) {
    event.preventDefault();
    if (mismatch) return;
    setError("");
    setFieldError("");
    setIsSaving(true);
    try {
      const result = await confirmPasswordReset(uid, token, password);
      navigate("/login", { replace: true, state: { passwordReset: true, username: result.username } });
    } catch (problem) {
      const data = problem.response?.data;
      if (data?.new_password) setFieldError([].concat(data.new_password).join(" "));
      else setError(apiError(problem, "Could not reset your password."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong animate-rise w-full max-w-md rounded-3xl p-7 md:p-9">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Link to="/login" className="mb-4 inline-flex items-center gap-2 text-ink-900">
              <span className="rounded-xl bg-brand-600 p-2 text-white">
                <Activity size={16} />
              </span>
              <span className="font-semibold tracking-tight">MediDesk</span>
            </Link>
            <h1 className="text-2xl font-semibold text-ink-900">Choose a new password</h1>
            <p className="mt-1 text-sm text-ink-500">You'll be signed out everywhere else once it's saved.</p>
          </div>
          <Mascot size={72} mood="calm" className="hidden shrink-0 sm:block" />
        </div>

        <Alert>{error}</Alert>
        {error.includes("expired") && (
          <p className="-mt-2 mb-4 text-sm">
            <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline">
              Send a new link
            </Link>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="New password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
            hint="At least 8 characters, not all numbers, and not like your name."
            error={fieldError}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
          <Button type="submit" busy={isSaving} disabled={!uid || !token} className="w-full">
            {isSaving ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
