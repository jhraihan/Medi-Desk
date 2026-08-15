import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api.js";
import { Alert, Button, Input, Select } from "../components/index.js";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("patient"); // Default role

  const [error, setError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsRegistering(true);

    try {
      // Send the data matching our Django UserSerializer
      await register({
        username,
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        role,
      });

      // If successful, send them to the login page so they can sign in
      navigate("/login", { replace: true });
    } catch (problem) {
      // Extract validation errors from Django if they exist
      const errorData = problem.response?.data;
      if (typeof errorData === "object") {
        // Grab the first error message from the object (e.g., "That username is already taken.")
        const firstKey = Object.keys(errorData)[0];
        setError(`${firstKey}: ${errorData[firstKey]}`);
      } else {
        setError("Registration failed. Please check your inputs.");
      }
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-indigo-600">
            Create an Account
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Register to access the Hospital System.
          </p>
        </div>

        <Alert>{error}</Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="First Name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
            <Input
              label="Last Name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>

          <Input
            label="Username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <Input
            label="Password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <Select
            label="Role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
            <option value="receptionist">Receptionist</option>
            <option value="admin">Admin</option>
          </Select>

          <Button
            type="submit"
            disabled={isRegistering}
            className="mt-6 w-full justify-center"
          >
            {isRegistering ? "Registering..." : "Sign Up"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-indigo-600 hover:underline"
          >
            Log in here
          </Link>
        </p>
      </div>
    </div>
  );
}
