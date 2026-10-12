import { Link, useLocation } from "react-router-dom";

import { routes } from "@/config/navigation";
import { websitesInfo } from "@/config/websitesInfo";

export function Logo({ compact = false }: { compact?: boolean }) {
  const location = useLocation();

  const handleClick = () => {
    if (location.pathname === routes.home) {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  };

  return (
    <Link to={routes.home} onClick={handleClick} className="logo" aria-label={`${websitesInfo.name} home`}>
      <img src={websitesInfo.logo} alt="" width={30} height={30} className="logo__mark" />
      {!compact && <span className="logo__name">{websitesInfo.shortName}</span>}
    </Link>
  );
}
