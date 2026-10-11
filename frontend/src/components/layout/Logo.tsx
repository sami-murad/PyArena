import { Link } from "react-router-dom";

import { routes } from "@/config/navigation";
import { websitesInfo } from "@/config/websitesInfo";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to={routes.home} className="logo" aria-label={`${websitesInfo.name} home`}>
      <img src={websitesInfo.logo} alt="" width={30} height={30} className="logo__mark" />
      {!compact && <span className="logo__name">{websitesInfo.shortName}</span>}
    </Link>
  );
}
