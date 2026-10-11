import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { routes } from "@/config/navigation";
import { websitesInfo } from "@/config/websitesInfo";
import { useAuth } from "@/features/auth/AuthContext";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { safeRedirect } from "@/features/auth/LoginPage";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { errorMessage } from "@/services/apiClient";

interface Errors {
  username?: string;
  email?: string;
  password?: string;
  form?: string;
}

export function validateRegistration(username: string, email: string, password: string): Errors {
  const errors: Errors = {};
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) errors.username = "Use 3 to 24 letters, digits or underscores.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 8) errors.password = "Use at least 8 characters.";
  else if (password.length > 128) errors.password = "Use at most 128 characters.";
  return errors;
}

export default function RegisterPage() {
  useDocumentTitle("Create account");
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const target = safeRedirect((location.state as { from?: string } | null)?.from);

  if (user) return <Navigate to={target} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateRegistration(username, email, password);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await register(username, email, password);
      navigate(target, { replace: true });
    } catch (err) {
      setErrors({ form: errorMessage(err) });
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={`Join ${websitesInfo.name}`}
      lead="Create an account to save your work and enter competitions."
      footer={
        <>
          Already have an account?{" "}
          <Link to={routes.login} state={location.state}>
            Sign in
          </Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={submit} noValidate>
        <Input label="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} error={errors.username} hint="Shown to other players." autoFocus />
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Input label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="At least 8 characters." />
        {errors.form && (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy} block>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
