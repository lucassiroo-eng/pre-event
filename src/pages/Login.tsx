import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, EMAIL_DOMAIN } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = mode === "login" ? login(email, password) : signup(email, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div className="space-y-1.5 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
            F
          </div>
          <h1 className="text-lg font-semibold">Pre-Event</h1>
          <p className="text-xs text-muted-foreground">Acceso restringido a {EMAIL_DOMAIN}</p>
        </div>

        <div className="flex rounded-md border p-0.5 text-xs">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 rounded px-3 py-1.5 transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email corporativo</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={`tu.nombre${EMAIL_DOMAIN}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "signup" ? "Mínimo 6 caracteres" : ""}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full">
            {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
