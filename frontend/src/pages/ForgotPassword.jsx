import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, MailCheck } from "lucide-react";
import { requestPasswordReset } from "../api.js";
import { apiError } from "../errors.js";
import { Alert, Button, Input, Mascot } from "../components/index.js";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSending(true);
    try {
      await requestPasswordReset(email.trim());
      setSentTo(email.trim());
    } catch (problem) {
      setError(apiError(problem, "Could not send the reset email. Try again in a moment."));
    } finally {
      setIsSending(false);
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
            <h1 className="text-2xl font-semibold text-ink-900">Forgot your password?</h1>
            <p className="mt-1 text-sm text-ink-500">
              Enter the email on your account and we'll send you a link to choose a new one.
            </p>
          </div>
          <Mascot size={72} mood="caring" className="hidden shrink-0 sm:block" />
        </div>

        {sentTo ? (
          <div className="rounded-2xl bg-emerald-50/80 p-5 text-sm text-emerald-900" role="status">
            <MailCheck size={20} className="mb-2 text-emerald-600" />
            <p className="font-medium">Check your inbox.</p>
            <p className="mt-1">
              If {sentTo} belongs to an account, a reset link is on its way. It works once and expires in two
              hours. No email? Check spam, or ask the front desk to reset it for you.
            </p>
          </div>
        ) : (
          <>
            <Alert>{error}</Alert>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" busy={isSending} className="w-full">
                {isSending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-ink-500">
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
