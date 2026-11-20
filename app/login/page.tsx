
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { firebaseAuthService } from "@/services/auth/firebaseAuthService";

export default function Login() {
  const router = useRouter();

  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = isRegistering
        ? await firebaseAuthService.registerPatient(name, email, password)
        : await firebaseAuthService.login(email, password);

      router.replace(`/${user.role}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-extrabold text-teal">Qurely</h1>

      <p className="mt-2 text-ink/70">
        {isRegistering
          ? "Create your patient account."
          : "Sign in to your Qurely account."}
      </p>

      <form onSubmit={handleSubmit} className="card mt-6 space-y-4">
        {isRegistering && (
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Full name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-ink/20 p-3"
              placeholder="Enter your full name"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-semibold">
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ink/20 p-3"
            placeholder="Enter your email"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">
            Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-ink/20 p-3"
            placeholder="Enter your password"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50"
        >
          {loading
            ? "Please wait..."
            : isRegistering
              ? "Create patient account"
              : "Sign in"}
        </button>

        <p className="text-center text-sm text-ink/70">
          {isRegistering
            ? "Already have an account?"
            : "New patient?"}{" "}
          <button
            type="button"
            className="font-semibold text-teal"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError("");
            }}
          >
            {isRegistering ? "Sign in" : "Create an account"}
          </button>
        </p>
      </form>
    </main>
  );
}
