import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Activity, LogOut, Menu } from "lucide-react";
import { useAuth } from "../auth-context.js";
import { fullName } from "../format.js";
import { isActive, NAV } from "../navigation.js";
import Modal from "./Modal.jsx";

// The phone tab bar fits four pages; the rest, and signing out, live under "More".
const TAB_BAR_SIZE = 4;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

export default function Layout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    await signOut();
    navigate("/login", { replace: true });
  }

  const links = NAV.filter((item) => !item.roles || item.roles.includes(user?.role));
  const current = links.find((item) => isActive(pathname, item.to));
  const tabs = links.slice(0, TAB_BAR_SIZE);
  const moreIsActive = !tabs.some((item) => isActive(pathname, item.to));
  const initials = (user?.first_name?.[0] || user?.username?.[0] || "?").toUpperCase();
  const displayName = fullName(user);

  // A new page starts at the top, and names the browser tab after itself.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    document.title = current ? `${current.label} · MediDesk` : "MediDesk";
  }, [current]);

  const avatar = (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
      {initials}
    </span>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col p-4 md:flex">
        <div className="glass-strong flex h-full flex-col rounded-2xl p-4">
          <Link to="/dashboard" className={`mb-6 flex items-center gap-2 rounded-xl px-1 ${focusRing}`}>
            <span className="rounded-xl bg-brand-600 p-2 text-white">
              <Activity size={18} />
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink-900">MediDesk</span>
          </Link>

          <nav aria-label="Main" className="-mx-1 flex flex-1 flex-col gap-1 overflow-y-auto px-1">
            {links.map(({ to, label, icon: Icon }) => {
              const active = isActive(pathname, to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${focusRing} ${
                    active ? "bg-brand-600 text-white shadow-sm" : "text-ink-700 hover:bg-white/70"
                  }`}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-5 border-t border-white/70 pt-4">
            <div className="mb-3 flex items-center gap-2 px-1">
              {avatar}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{displayName}</p>
                <p className="text-xs capitalize text-ink-500">{user?.role}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50 disabled:opacity-60 ${focusRing}`}
            >
              <LogOut size={16} /> {signingOut ? "Signing out…" : "Log out"}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-strong sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 md:hidden">
          <Link to="/dashboard" className={`flex items-center gap-2 rounded-xl ${focusRing}`}>
            <span className="rounded-lg bg-brand-600 p-1.5 text-white">
              <Activity size={15} />
            </span>
            <span className="font-semibold tracking-tight text-ink-900">MediDesk</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open account menu"
            className={`rounded-full ${focusRing}`}
          >
            {avatar}
          </button>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-28 md:p-8 md:pb-8">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Main"
        className="glass-strong fixed right-0 bottom-0 left-0 z-30 flex justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      >
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = isActive(pathname, to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors duration-200 ${focusRing} ${
                active ? "text-brand-700" : "text-ink-500"
              }`}
            >
              <Icon size={19} />
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors duration-200 ${focusRing} ${
            moreIsActive ? "text-brand-700" : "text-ink-500"
          }`}
        >
          <Menu size={19} />
          More
        </button>
      </nav>

      <Modal open={menuOpen} title="Menu" onClose={() => setMenuOpen(false)}>
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-50/70 p-3">
          {avatar}
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{displayName}</p>
            <p className="text-xs capitalize text-ink-500">{user?.role}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {links.map(({ to, label, icon: Icon }) => {
            const active = isActive(pathname, to);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-medium ${focusRing} ${
                  active ? "bg-brand-600 text-white" : "bg-white text-ink-700 ring-1 ring-brand-100 hover:bg-brand-50"
                }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-100 hover:bg-rose-50 disabled:opacity-60 ${focusRing}`}
        >
          <LogOut size={16} /> {signingOut ? "Signing out…" : "Log out"}
        </button>
      </Modal>
    </div>
  );
}
