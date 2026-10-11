import { visibleSocialLinks } from "@/config/socialLinks";
import { hasContactEmail, websitesInfo } from "@/config/websitesInfo";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AboutPage() {
  useDocumentTitle("About");
  return (
    <div className="page page--narrow prose">
      <h1 className="page__title">About {websitesInfo.name}</h1>
      <p className="page__lead">{websitesInfo.description}</p>
      <h2>How your code runs</h2>
      <p>
        Code never runs in your browser or in the web server. The API forwards it to a separate judge worker that starts
        a fresh Python process for every run, with limits on time, memory, processes, output and file size, and no
        access to secrets. Competition answers are checked on the server; hidden tests never leave it.
      </p>
      <h2>Built with</h2>
      <p>React, TypeScript, Vite and Monaco on the front end; FastAPI, SQLAlchemy, PostgreSQL and Socket.IO on the back end.</p>
      {(hasContactEmail || visibleSocialLinks.length > 0) && (
        <>
          <h2>Contact</h2>
          <ul>
            {hasContactEmail && (
              <li>
                <a href={`mailto:${websitesInfo.email}`}>{websitesInfo.email}</a>
              </li>
            )}
            {visibleSocialLinks.map((l) => (
              <li key={l.label}>
                <a href={l.url} target="_blank" rel="noreferrer noopener">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted">Version {websitesInfo.version}</p>
    </div>
  );
}
