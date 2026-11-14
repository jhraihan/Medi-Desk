import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity } from "lucide-react";
import { register } from "../api.js";
import { Alert, Button, Input, Mascot } from "../components/index.js";

const FIELDS = ["first_name", "last_name", "username", "email", "password"];

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isRegistering, setIsRegistering] = useState(false);
  const navigate = useNavigate();

  const mismatch = confirm && confirm !== password ? "The two passwords don't match." : "";

  async function handleSubmit(event) {
    event.preventDefault();
    if (mismatch) return;

    setError("");
    setFieldErrors({});
    setIsRegistering(true);

    try {
      await register({
        username: username.trim(),
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      navigate("/login", { replace: true, state: { registered: true, username: username.trim() } });
    } catch (problem) {
      const data = problem.response?.data;
      if (data && typeof data === "object") {
        // Show each message beside its own field; anything else goes in the banner.
        const byField = {};
        for (const name of FIELDS) {
          if (data[name]) byField[name] = [].concat(data[name]).join(" ");
        }
        setFieldErrors(byField);
        const other = data.detail || data.non_field_errors?.[0];
        setError(other || (Object.keys(byField).length ? "" : "Registration failed. Please check your details."));
      } else {
        setError("Registration failed. Please check your connection and try again.");
      }
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong animate-rise w-full max-w-lg rounded-3xl p-7 md:p-9">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Link to="/login" className="mb-4 inline-flex items-center gap-2 text-ink-900">
              <span className="rounded-xl bg-brand-600 p-2 text-white">
                <Activity size={16} />
              </span>
              <span className="font-semibold tracking-tight">MediDesk</span>
            </Link>
            <h1 className="text-2xl font-semibold text-ink-900">Create your patient account</h1>
            <p className="mt-1 text-sm text-ink-500">
              Book visits, follow the queue and keep your records in one place.
            </p>
          </div>
          <Mascot size={76} mood="happy" className="hidden shrink-0 sm:block" />
        </div>

        <Alert>{error}</Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="First name"
              required
              autoComplete="given-name"
              autoFocus
              value={firstName}
              error={fieldErrors.first_name}
              onChange={(event) => setFirstName(event.target.value)}
            />
            <Input
              label="Last name"
              autoComplete="family-name"
              value={lastName}
              error={fieldErrors.last_name}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>

          <Input
            label="Username"
            required
            autoComplete="username"
            autoCapitalize="none"
            hint="You'll use this to sign in."
            value={username}
            error={fieldErrors.username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <Input
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              hint="At least 8 characters, not only numbers."
              value={password}
              error={fieldErrors.password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Input
              label="Confirm password"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              error={mismatch}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>

          <Button type="submit" busy={isRegistering} disabled={Boolean(mismatch)} className="mt-2 w-full">
            {isRegistering ? "Creating your account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
