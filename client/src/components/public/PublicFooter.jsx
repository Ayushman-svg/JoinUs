import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import BrandMark from '../BrandMark.jsx';

function GitHubIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export default function PublicFooter() {
  return (
    <footer className="public-footer" role="contentinfo">
      <div className="public-footer__container">
        {/* Brand & Mission Column */}
        <div className="public-footer__brand-col">
          <Link to="/" className="public-footer__brand" aria-label="JoinUs Home">
            <BrandMark />
          </Link>
          <p className="public-footer__tagline">
            Lightweight, host-moderated video meetings with custom WebRTC peer-to-peer signaling,
            in-meeting chat, and meeting transcripts in your browser.
          </p>
          <div className="public-footer__github">
            <a
              href="https://github.com/Ayushman-svg/JoinUs"
              target="_blank"
              rel="noopener noreferrer"
              className="public-footer__github-link"
              aria-label="JoinUs source code on GitHub"
            >
              <Github size={18} aria-hidden="true" />
              <span>View on GitHub</span>
            </a>
          </div>
        </div>

        {/* Navigation Link Columns */}
        <div className="public-footer__links-grid">
          <div className="public-footer__col">
            <h3 className="public-footer__col-title">Product</h3>
            <ul className="public-footer__list">
              <li>
                <Link to="/features" className="public-footer__link">
                  Features
                </Link>
              </li>
              <li>
                <a href="/#how-it-works" className="public-footer__link">
                  How it works
                </a>
              </li>
              <li>
                <Link to="/security" className="public-footer__link">
                  Security
                </Link>
              </li>
              <li>
                <a href="/#faq" className="public-footer__link">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          <div className="public-footer__col">
            <h3 className="public-footer__col-title">Account</h3>
            <ul className="public-footer__list">
              <li>
                <Link to="/login" className="public-footer__link">
                  Sign in
                </Link>
              </li>
              <li>
                <Link to="/register" className="public-footer__link">
                  Get started
                </Link>
              </li>
            </ul>
          </div>

          <div className="public-footer__col">
            <h3 className="public-footer__col-title">Legal & Project</h3>
            <ul className="public-footer__list">
              <li>
                <Link to="/terms" className="public-footer__link">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="public-footer__link">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Disclaimer Bar */}
      <div className="public-footer__bottom">
        <div className="public-footer__bottom-container">
          <p className="public-footer__disclaimer">
            JoinUs is an open-source student project built with raw WebRTC and Express. It is an independent project and is not affiliated with, sponsored by, or endorsed by Zoom Video Communications, Inc.
          </p>
          <p className="public-footer__copy">
            © {new Date().getFullYear()} JoinUs. Built for modern browsers.
          </p>
        </div>
      </div>
    </footer>
  );
}
