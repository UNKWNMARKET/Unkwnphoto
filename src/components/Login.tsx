import { useState } from "react";
import { login } from "../lib/api";

interface LoginProps {
  configured: boolean;
  onSignedIn: () => void;
}

export default function Login({ configured, onSignedIn }: LoginProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(password);
      setPassword("");
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-form" onSubmit={submit}>
        <h1 className="login-title">Sign in</h1>
        <p className="login-sub">This area is private.</p>

        {!configured && (
          <p className="notice">
            No password is set on this deployment yet. Add an
            <code> ADMIN_PASSWORD </code> environment variable in the Vercel
            project settings, then redeploy.
          </p>
        )}

        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy || !configured}
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="button primary" type="submit" disabled={busy || !configured}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
