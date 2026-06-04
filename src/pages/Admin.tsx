import { useMemo, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { readUsersList, type UserEntry } from "@/lib/auth";
import { cloudFetchUsers, type CloudUserEntry } from "@/lib/cloudStore";
import { readApiCalls, readPptDownloads, type ApiCallLog, type PptDownload } from "@/lib/enrichmentStore";
import { Users, Activity, FileDown, Loader2 } from "lucide-react";

export function AdminPage() {
  const localUsers = useMemo(() => readUsersList(), []);
  const [cloudUsers, setCloudUsers] = useState<CloudUserEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cloudFetchUsers()
      .then((data) => setCloudUsers(data))
      .finally(() => setLoading(false));
  }, []);

  const users: UserEntry[] = useMemo(() => {
    if (!cloudUsers) return localUsers;
    const map = new Map<string, UserEntry>();
    for (const u of cloudUsers) {
      map.set(u.email, { email: u.email, lastLogin: u.lastLogin, loginCount: u.loginCount });
    }
    for (const u of localUsers) {
      if (!map.has(u.email)) {
        map.set(u.email, u);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime()
    );
  }, [cloudUsers, localUsers]);
  const apiCalls = useMemo(() => readApiCalls(), []);
  const pptDownloads = useMemo(() => readPptDownloads(), []);

  const totalHs = apiCalls.reduce((s, l) => s + l.hubspot, 0);
  const totalSirene = apiCalls.reduce((s, l) => s + l.sirene, 0);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader title="Admin" subtitle="Usuarios, API calls y descargas PPT" />

      <div className="mt-6 space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4" />
            <h2 className="text-base font-semibold">Usuarios registrados ({users.length})</h2>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando usuarios…
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún usuario registrado todavía.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-right">Logins</th>
                    <th className="px-4 py-3 text-left">Last login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u: UserEntry) => (
                    <tr key={u.email} className="hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">{u.email}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{u.loginCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(u.lastLogin).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4" />
            <h2 className="text-base font-semibold">API Calls</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">HubSpot total</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">{totalHs.toLocaleString()}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">SIRENE total</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">{totalSirene.toLocaleString()}</div>
            </Card>
          </div>
          {apiCalls.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-right">HubSpot</th>
                    <th className="px-4 py-3 text-right">SIRENE</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {apiCalls.slice(0, 30).map((l: ApiCallLog) => (
                    <tr key={l.date} className="hover:bg-muted/40">
                      <td className="px-4 py-3 tabular-nums">{l.date}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{l.hubspot}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{l.sirene}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{l.hubspot + l.sirene}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FileDown className="h-4 w-4" />
            <h2 className="text-base font-semibold">Descargas PPT ({pptDownloads.length})</h2>
          </div>
          {pptDownloads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin descargas todavía.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-left">Región</th>
                    <th className="px-4 py-3 text-left">País</th>
                    <th className="px-4 py-3 text-left">Usuario</th>
                    <th className="px-4 py-3 text-left">Secciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pptDownloads.slice(0, 50).map((d: PptDownload, i: number) => (
                    <tr key={i} className="hover:bg-muted/40">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{new Date(d.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3">{d.region}</td>
                      <td className="px-4 py-3">{d.country.toUpperCase()}</td>
                      <td className="px-4 py-3 text-muted-foreground">{d.user}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{d.sections.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
