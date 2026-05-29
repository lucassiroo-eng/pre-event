import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { EnrichmentPanel } from "@/components/enrichment/EnrichmentPanel";

export const Route = createFileRoute("/enrichment")({
  head: () => ({ meta: [{ title: "Enrichment · Factorial France" }] }),
  component: EnrichmentPage,
});

function EnrichmentPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <PageHeader />
        <div className="px-8 py-6">
          <EnrichmentPanel />
        </div>
      </main>
    </div>
  );
}
