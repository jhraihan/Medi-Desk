import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { fetchMe, logout as apiLogout } from "./api.js";
import { AuthContext, useAuth } from "./auth-context.js";
import { EmptyState, Loading } from "./components/index.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // No stored token means there is nobody to look up, so skip the loading state.
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem("access_token")));

  useEffect(() => {
    if (!loading) return;

    let active = true;
    fetchMe()
      .then((me) => active && setUser(me))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [loading]);

  async function signOut() {
    await apiLogout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading message="Signing you in…" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

export function RoleRoute({ allow }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) {
    return (
      <EmptyState
        mood="alert"
        title="This page isn't part of your role"
        message={`Signed in as ${user.role}. Ask an administrator if you need access.`}
        action={
          <Link
            to="/dashboard"
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Back to dashboard
          </Link>
        }
      />
    );
  }
  return <Outlet />;
}
