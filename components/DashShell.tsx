
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import type { Role, User } from "@/types";
import { firebaseAuthService } from "@/services/auth/firebaseAuthService";
import { AuthUserProvider } from "@/components/AuthUserContext";

export default function DashShell({
  role,
  title,
  children,
}: {
  role: Role;
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const unsubscribe = firebaseAuthService.subscribe((currentUser) => {
      if (!active) return;

      if (!currentUser) {
        setUser(null);
        setChecking(false);
        router.replace("/login");
        return;
      }

      if (currentUser.role !== role) {
        setUser(null);
        setChecking(false);
        router.replace(`/${currentUser.role}`);
        return;
      }

      setUser(currentUser);
      setChecking(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [role, router]);

  async function handleLogout() {
    await firebaseAuthService.logout();
    router.replace("/login");
  }

  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink/60">Verifying your account...</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-ink/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-xl font-extrabold text-teal">
            Qurely
          </Link>

          <button
            className="btn-ghost"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="text-sm text-ink/60">
            Signed in as {user.name} · {user.role}
          </p>
        </div>

        <AuthUserProvider user={user}>
          {children}
        </AuthUserProvider>
      </main>
    </div>
  );
}
