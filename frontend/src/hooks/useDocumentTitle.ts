import { useEffect } from "react";

import { pageTitle } from "@/config/websitesInfo";

/** Sets the browser tab title from the central website name. */
export function useDocumentTitle(page?: string): void {
  useEffect(() => {
    document.title = pageTitle(page);
  }, [page]);
}
