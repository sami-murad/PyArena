import type { ReactNode } from "react";

import { websitesInfo } from "@/config/websitesInfo";

export function AuthLayout({ title, lead, children, footer }: { title: string; lead: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__brand" aria-hidden>
        <img src={websitesInfo.logo} alt="" width={56} height={56} />
        <p className="auth__tagline">{websitesInfo.tagline}</p>
      </div>
      <section className="panel auth__card">
        <h1 className="auth__title">{title}</h1>
        <p className="auth__lead">{lead}</p>
        {children}
        <p className="auth__footer">{footer}</p>
      </section>
    </div>
  );
}
