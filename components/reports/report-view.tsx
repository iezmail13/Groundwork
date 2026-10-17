import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import type { Report, ReportTone } from "@/lib/report-model";

const TONE: Record<Exclude<ReportTone, null>, { word: string; icon: typeof CircleCheck; cls: string }> = {
  good: { word: "On track", icon: CircleCheck, cls: "border-good text-good-ink" },
  warn: { word: "Watch", icon: TriangleAlert, cls: "border-warn text-warn-ink" },
  bad: { word: "Needs attention", icon: OctagonAlert, cls: "border-bad text-bad-ink" },
};

function ToneBadge({ tone }: { tone: ReportTone }) {
  if (!tone) return null;
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${t.cls}`}>
      <Icon aria-hidden className="size-3.5" />
      {t.word}
    </span>
  );
}

/**
 * A report (D109): its key figures, then ruled tables. The same markup is the
 * page, the printout (print styles turn it into a clean document) and what a
 * share link shows.
 */
export function ReportView({ report, sharedBy }: { report: Report; sharedBy?: string }) {
  const generated = new Date(report.generatedAt).toISOString().slice(0, 16).replace("T", " ");
  return (
    <article aria-labelledby="report-title" className="report flex flex-col gap-8" data-report={report.template}>
      <header className="flex flex-col gap-1 border-b-2 border-ink pb-4">
        <p className="font-heading text-sm font-semibold text-ink-muted">{report.organization}</p>
        <h2 id="report-title" className="font-heading text-2xl font-bold">
          {report.title}
        </h2>
        <p className="text-sm">{report.scope}</p>
        <p className="text-xs text-ink-muted">
          Generated {generated} UTC{sharedBy ? ` by ${sharedBy}` : ""}. It shows only what its author could see.
        </p>
      </header>
      {report.sections.map((s, i) => (
        <section key={i} aria-labelledby={`report-s${i}`} className="flex flex-col gap-3 break-inside-avoid-page">
          <h3 id={`report-s${i}`} className="font-heading text-lg font-bold">
            {s.heading}
          </h3>
          {s.summary ? <p className="text-sm">{s.summary}</p> : null}
          {s.stats?.length ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-rule py-3 sm:grid-cols-4">
              {s.stats.map((st) => (
                <div key={st.label} className="flex flex-col gap-1">
                  <dt className="text-sm text-ink-muted">{st.label}</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-2xl font-bold tabular-nums">{st.value}</span>
                    {st.tone ? <ToneBadge tone={st.tone} /> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {s.table ? (
            s.table.rows.length === 0 ? (
              <p className="text-sm text-ink-muted">{s.table.empty}</p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">{s.table.caption}</caption>
                  <thead>
                    <tr className="border-b border-ink font-heading">
                      {s.table.head.map((h, j) => (
                        <th key={j} scope="col" className={`py-2 pr-3 ${s.table!.numeric?.includes(j) ? "text-right" : ""}`}>
                          {h}
                        </th>
                      ))}
                      {s.table.tones ? (
                        <th scope="col" className="py-2">
                          State
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((r, k) => (
                      <tr key={k} className="border-b border-rule break-inside-avoid">
                        {r.map((c, j) =>
                          j === 0 ? (
                            <th key={j} scope="row" className="py-2 pr-3 text-left font-semibold">
                              {c}
                            </th>
                          ) : (
                            <td key={j} className={`py-2 pr-3 ${s.table!.numeric?.includes(j) ? "text-right tabular-nums" : ""}`}>
                              {c}
                            </td>
                          ),
                        )}
                        {s.table!.tones ? (
                          <td className="py-2">
                            <ToneBadge tone={s.table!.tones[k] ?? null} />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </section>
      ))}
    </article>
  );
}
