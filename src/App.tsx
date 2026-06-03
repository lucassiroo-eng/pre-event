import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DealsProvider } from "@/lib/useDeals";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { LoginPage } from "@/pages/Login";
import { CountryPicker } from "@/pages/CountryPicker";
import { OverviewPage } from "@/pages/Overview";
import { TablePage } from "@/pages/Table";
import { EnrichmentPage } from "@/pages/Enrichment";
import { AdminPage } from "@/pages/Admin";

export function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { isAuthenticated, hydrated } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated && !isLoginRoute) {
      navigate("/login", { replace: true });
    }
    if (isAuthenticated && isLoginRoute) {
      navigate("/", { replace: true });
    }
  }, [hydrated, isAuthenticated, isLoginRoute, pathname, navigate]);

  if (!hydrated) return null;

  if (isLoginRoute || !isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <DealsProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <TopBar />
          <Routes>
            <Route path="/" element={<CountryPicker />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/table" element={<TablePage />} />
            <Route path="/enrichment" element={<EnrichmentPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </DealsProvider>
  );
}
