import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, CalendarDays, HeartPulse, ShieldCheck } from "lucide-react";
import { fetchMe, login } from "../api.js";
import { useAuth } from "../auth-context.js";
import { Alert, Button, Input } from "../components/index.js";

const DEMO_ACCOUNTS = [
  { username: "hospital_admin", label: "Admin", hint: "Everything" },
  { username: "aisha", label: "Doctor", hint: "Clinic & prescribing" },
  { username: "reception", label: "Receptionist", hint: "Front desk" },
  { username: "pharmacy", label: "Pharmacist", hint: "Dispensing & stock" },
  { username: "rafi", label: "Patient", hint: "Queue, records, reminders" },
];

const DEMO_PASSWORD = "Demo!2345";

const HIGHLIGHTS = [
  { icon: CalendarDays, title: "Live queue", text: "See your position and waiting time in real time." },
  { icon: HeartPulse, title: "Your records", text: "Prescriptions and reports, kept in one place." },
  { icon: ShieldCheck, title: "Private by default", text: "Only you decide who sees your history." },
];

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  async function signIn(name, secret) {
    setError("");
    setIsLoggingIn(true);

    try {
      const data = await login(name, secret);
      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      setUser(await fetchMe());
      navigate("/dashboard", { replace: true });
    } catch (problem) {
      setError(problem.response?.data?.detail || "Invalid username or password.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    signIn(username, password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl glass-strong md:grid-cols-2">
        <div className="glass-tinted hidden flex-col justify-between p-9 md:flex">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-white/20 p-2">
              <Activity size={18} />
            </span>
            <span className="text-lg font-semibold tracking-tight">MediDesk</span>
          </div>

          <div className="animate-rise">
            <h2 className="text-3xl font-semibold leading-tight">
              Care that respects
              <br />
              your time.
            </h2>
            <p className="mt-3 max-w-xs text-sm text-white/75">
              Book an appointment, watch the queue move, and keep every record in one place.
            </p>
          </div>

          <div className="stagger space-y-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl bg-white/10 p-3">
                <span className="rounded-lg bg-white/20 p-2">
                  <Icon size={15} />
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-white/70">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="animate-fade p-8 md:p-10">
          <span className="pill bg-brand-100 text-brand-700">Welcome back</span>
          <h1 className="mt-3 text-2xl font-semibold text-ink-900">Sign in to MediDesk</h1>
          <p className="mt-1 mb-6 text-sm text-ink-500">
            Use the account your hospital gave you.
          </p>

          <Alert>{error}</Alert>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username"
              placeholder="your username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" disabled={isLoggingIn} className="w-full">
              {isLoggingIn ? "Signing in…" : "Log in"}
            </Button>
          </form>

          <div className="mt-7 border-t border-brand-100 pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Try a demo account
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  disabled={isLoggingIn}
                  onClick={() => signIn(account.username, DEMO_PASSWORD)}
                  className="rounded-xl border border-brand-200/70 bg-white/70 px-3 py-2 text-left transition-all duration-200 hover:border-brand-400 hover:bg-white disabled:opacity-60"
                >
                  <span className="block text-sm font-medium text-ink-900">{account.label}</span>
                  <span className="block text-xs text-ink-500">{account.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-400">
              All demo accounts use the password {DEMO_PASSWORD}
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-ink-500">
            New patient?{" "}
            <Link to="/register" className="font-medium text-brand-700 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
