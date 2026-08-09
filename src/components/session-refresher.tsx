"use client";

import { useEffect } from "react";

import { authClient } from "@/auth/client";

export function SessionRefresher() {
  useEffect(() => {
    // Route Handlers can return the renewed cookie; Server Component auth
    // checks can read cookies but cannot persist Better Auth's sliding refresh.
    void authClient.getSession().catch(() => undefined);
  }, []);

  return null;
}
