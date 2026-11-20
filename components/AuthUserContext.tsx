"use client";

import { createContext, useContext } from "react";
import type { User } from "@/types";

const AuthUserContext = createContext<User | null>(null);

export function AuthUserProvider({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  return (
    <AuthUserContext.Provider value={user}>
      {children}
    </AuthUserContext.Provider>
  );
}

export function useCurrentUser() {
  const user = useContext(AuthUserContext);

  if (!user) {
    throw new Error("useCurrentUser must be used inside AuthUserProvider.");
  }

  return user;
}