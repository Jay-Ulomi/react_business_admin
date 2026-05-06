type PlaceholderPageProps = {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Module</p>
      <h2 className="mt-2 font-display text-2xl text-slate-900">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm text-slate-600">{description}</p>
      <div className="mt-6 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        API integration points are ready; build module-specific tables/forms next.
      </div>
    </section>
  )
}
