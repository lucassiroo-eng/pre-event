interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <header
      className="relative overflow-hidden rounded-2xl px-6 py-8 text-white shadow-sm sm:px-10 sm:py-10"
      style={{ background: "var(--gradient-factorial)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(800px 300px at 90% -10%, rgba(255,255,255,0.35), transparent 60%), radial-gradient(600px 250px at -10% 110%, rgba(0,0,0,0.25), transparent 60%)",
        }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-md">
            <span className="text-2xl font-black leading-none">F</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            {subtitle && (
              <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}
