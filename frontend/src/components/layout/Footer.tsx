import { Link } from "react-router-dom";

import { footerNavigation } from "@/config/navigation";
import { visibleSocialLinks } from "@/config/socialLinks";
import { hasContactEmail, websitesInfo } from "@/config/websitesInfo";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <p className="footer__brand">
          <strong>{websitesInfo.name}</strong> <span className="footer__tagline">{websitesInfo.tagline}</span>
        </p>
        <nav className="footer__links" aria-label="Footer">
          {footerNavigation.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
          {visibleSocialLinks.map((link) => (
            <a key={link.label} href={link.url} target="_blank" rel="noreferrer noopener">
              {link.label}
            </a>
          ))}
          {hasContactEmail && <a href={`mailto:${websitesInfo.email}`}>Contact</a>}
        </nav>
        <p className="footer__meta">Version {websitesInfo.version}</p>
      </div>
    </footer>
  );
}
