import { LogIn, LogOut, Menu, Moon, Sun, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { useTheme } from "@/app/ThemeContext";
import { Logo } from "@/components/layout/Logo";
import { useToast } from "@/components/feedback/Toast";
import { ButtonLink } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { primaryNavigation, routes } from "@/config/navigation";
import { useAuth } from "@/features/auth/AuthContext";
import { cx } from "@/utils/cx";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { user, checking, logout } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    // Navigating closes any open menu (state adjusted during render, no effect needed).
    setLastPath(location.pathname);
    setMenuOpen(false);
    setUserOpen(false);
  }

  useEffect(() => {
    if (!userOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !userRef.current?.contains(e.target as Node)) {
        setUserOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [userOpen]);

  const items = primaryNavigation.filter((item) => !item.requiresAuth || user);
  const themeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  async function handleLogout() {
    await logout();
    notify("Signed out.", "info");
    navigate(routes.home);
  }

  return (
    <header className="header">
      <div className="header__inner">
        <Logo />
        <nav className={cx("nav", menuOpen && "nav--open")} aria-label="Main">
          {items.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cx("nav__link", isActive && "nav__link--active")}>
              <Icon size={17} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header__actions">
          <Tooltip content={themeLabel}>
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={themeLabel}>
              {theme === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </button>
          </Tooltip>
          {checking ? null : user ? (
            <div className="user-menu" ref={userRef}>
              <button
                type="button"
                className="user-menu__trigger"
                aria-haspopup="menu"
                aria-expanded={userOpen}
                onClick={() => setUserOpen((o) => !o)}
              >
                <span className="avatar" aria-hidden>
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="user-menu__name">{user.username}</span>
              </button>
              {userOpen && (
                <div className="user-menu__list" role="menu">
                  <NavLink to={routes.profile} role="menuitem" className="user-menu__item">
                    <UserRound size={16} aria-hidden /> Profile
                  </NavLink>
                  <button type="button" role="menuitem" className="user-menu__item" onClick={handleLogout}>
                    <LogOut size={16} aria-hidden /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <ButtonLink
              to={routes.login}
              state={{ from: location.pathname }}
              size="sm"
              variant="secondary"
              icon={<LogIn size={16} aria-hidden />}
            >
              Sign in
            </ButtonLink>
          )}
          <button
            type="button"
            className="icon-btn nav-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>
    </header>
  );
}
