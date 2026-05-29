import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/Sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong on our end.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Factorial France · Partner Dashboard" },
      { name: "description", content: "Regional performance, Blitz Day insights & partner pipeline intelligence for Factorial France." },
      { property: "og:title", content: "Factorial France · Partner Dashboard" },
      { name: "twitter:title", content: "Factorial France · Partner Dashboard" },
      { property: "og:description", content: "Regional performance, Blitz Day insights & partner pipeline intelligence for Factorial France." },
      { name: "twitter:description", content: "Regional performance, Blitz Day insights & partner pipeline intelligence for Factorial France." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d605c4ae-3d76-41c4-83b0-7b639c1c297e/id-preview-15389cb6--61d55ea0-eeac-4075-be09-661604553e86.lovable.app-1779961179296.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d605c4ae-3d76-41c4-83b0-7b639c1c297e/id-preview-15389cb6--61d55ea0-eeac-4075-be09-661604553e86.lovable.app-1779961179296.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </QueryClientProvider>
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
      navigate({ to: "/login", search: { redirect: pathname }, replace: true });
    }
    if (isAuthenticated && isLoginRoute) {
      navigate({ to: "/", replace: true });
    }
  }, [hydrated, isAuthenticated, isLoginRoute, pathname, navigate]);

  if (!hydrated) return null;

  // Login page: render bare (no sidebar/shell).
  if (isLoginRoute || !isAuthenticated) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
