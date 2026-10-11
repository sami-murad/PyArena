import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { routes } from "@/config/navigation";
import { websitesInfo } from "@/config/websitesInfo";
import { useAuth } from "@/features/auth/AuthContext";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { errorMessage } from "@/services/apiClient";

export function safeRedirect(from: unknown): string {
  // Only same-site paths; never redirect to another origin after sign-in.
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : routes.playground;
}

export default function LoginPage() {
  useDocumentTitle("Sign in");
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = safeRedirect((location.state as { from?: string } | null)?.from);

  if (user) return <Navigate to={target} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!loginName.trim() || !password) {
      setError("Enter your username or email and your password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(loginName.trim(), password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={`Sign in to ${websitesInfo.name}`}
      lead="Save snippets, track your solved questions and compete with friends."
      footer={
        <>
          New here?{" "}
          <Link to={routes.register} state={location.state}>
            Create an account
          </Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        <Input label="Username or email" autoComplete="username" value={loginName} onChange={(e) => setLoginName(e.target.value)} autoFocus />
        <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy} block>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
