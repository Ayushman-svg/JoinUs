import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import BrandMark from '../BrandMark.jsx';
import ThemeToggle from '../ThemeToggle.jsx';

export default function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.hash]);

  // Close mobile menu on Escape key
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  return (
    <header className="public-header" role="banner">
      <div className="public-header__container">
        {/* Brand Logo */}
        <Link to="/" className="public-header__brand" aria-label="JoinUs Home">
          <BrandMark />
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="public-header__nav" aria-label="Main navigation">
          <NavLink
            to="/features"
            className={({ isActive }) =>
              `public-header__link ${isActive ? 'is-active' : ''}`.trim()
            }
          >
            Features
          </NavLink>
          <a href="/#how-it-works" className="public-header__link">
            How it works
          </a>
          <NavLink
            to="/security"
            className={({ isActive }) =>
              `public-header__link ${isActive ? 'is-active' : ''}`.trim()
            }
          >
            Security
          </NavLink>
          <a href="/#faq" className="public-header__link">
            FAQ
          </a>
        </nav>

        {/* Desktop Action Buttons */}
        <div className="public-header__actions">
          <ThemeToggle />
          <Link to="/login" className="public-header__btn-signin">
            Sign in
          </Link>
          <Link to="/register" className="public-header__btn-get-started">
            Get started
          </Link>
        </div>

        {/* Mobile Menu Toggle Button */}
        <button
          type="button"
          className="public-header__mobile-toggle"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
          aria-controls="public-mobile-menu"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileOpen && (
        <div id="public-mobile-menu" className="public-header__mobile-drawer" role="navigation" aria-label="Mobile navigation">
          <nav className="public-header__mobile-links">
            <NavLink to="/features" className="public-header__mobile-link">
              Features
            </NavLink>
            <a href="/#how-it-works" className="public-header__mobile-link">
              How it works
            </a>
            <NavLink to="/security" className="public-header__mobile-link">
              Security
            </NavLink>
            <a href="/#faq" className="public-header__mobile-link">
              FAQ
            </a>
          </nav>
          <div className="public-header__mobile-actions">
            <div className="public-header__mobile-theme">
              <span>Theme</span>
              <ThemeToggle />
            </div>
            <Link to="/login" className="public-header__mobile-btn-signin">
              Sign in
            </Link>
            <Link to="/register" className="public-header__mobile-btn-get-started">
              Get started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
