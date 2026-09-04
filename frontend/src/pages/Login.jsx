import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchMe, login } from "../api.js";
import { useAuth } from "../auth-context.js";
import { Alert, Button, Input } from "../components/index.js";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsLoggingIn(true);

    try {
      const data = await login(username, password);

      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);

      setUser(await fetchMe());
      navigate("/dashboard", { replace: true });
    } catch (problem) {
      const errorMsg =
        problem.response?.data?.detail || "Invalid username or password.";
      setError(errorMsg);
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <h1 className="text-xl font-bold text-indigo-600">
            Sign in to MediDesk
          </h1>
        </div>

        <Alert>{error}</Alert>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <Input
              label="Username"
              placeholder="admin"
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
          </div>

          <Button
            type="submit"
            disabled={isLoggingIn}
            className="mt-6 w-full justify-center disabled:opacity-60"
          >
            {isLoggingIn ? "Logging in..." : "Log in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-indigo-600 hover:underline"
          >
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
