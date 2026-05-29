import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RegionDetailPanel } from "@/components/dashboard/RegionDetailPanel";
import { REGIONS, type RegionCode } from "@/data/mockData";

export const Route = createFileRoute("/regions/$code")({
  component: RegionDetailRoute,
});

function RegionDetailRoute() {
  const { code } = Route.useParams();
  const meta = REGIONS.find(r => r.code === code);
  if (!meta) throw notFound();
  return (
    <div className="mx-auto max-w-[900px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader
        title={meta.name}
        subtitle="Regional insights, last deals & Blitz Day recommendations."
        actions={
          <Link to="/regions" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
            <ArrowLeft className="h-3 w-3" /> All regions
          </Link>
        }
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <RegionDetailPanel code={code as RegionCode} onClose={() => history.back()} />
      </div>
    </div>
  );
}
