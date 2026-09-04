import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { fetchMe, logout as apiLogout } from "./api.js";
import { AuthContext, useAuth } from "./auth-context.js";

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

  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

export function RoleRoute({ allow }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold text-slate-800">Not available</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your role doesn&apos;t have access to this page.
        </p>
      </div>
    );
  }
  return <Outlet />;
}
