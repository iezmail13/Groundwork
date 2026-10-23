// Reports (D109). One model serves the page, the printout, CSV and share links.

export type ReportTemplate = "progress" | "resources" | "costs" | "attendance";

export type ReportTone = "good" | "warn" | "bad" | null;

export type ReportStat = { label: string; value: string; tone?: ReportTone };

export type ReportTable = {
  caption: string;
  head: string[];
  /** Columns that hold numbers, aligned right. */
  numeric?: number[];
  rows: (string | number)[][];
  /** A word for each row's state, shown as a badge with its text (never colour alone). */
  tones?: ReportTone[];
  empty: string;
};

export type ReportSection = { heading: string; summary?: string; stats?: ReportStat[]; table?: ReportTable };

export type Report = {
  template: ReportTemplate;
  title: string;
  /** What it covers: the program and dates. */
  scope: string;
  from: string;
  to: string;
  generatedAt: string;
  organization: string;
  sections: ReportSection[];
};

export const REPORT_TEMPLATES: ReportTemplate[] = ["progress", "resources", "costs", "attendance"];

/** CSV rows for a report: a title block, then each section's figures and table. */
export function reportCsvRows(report: Report): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [[report.title], [report.scope], [`Generated ${report.generatedAt.slice(0, 16).replace("T", " ")} UTC`], []];
  for (const s of report.sections) {
    rows.push([s.heading]);
    if (s.summary) rows.push([s.summary]);
    for (const stat of s.stats ?? []) rows.push([stat.label, stat.value]);
    if (s.table) {
      rows.push(s.table.head);
      for (const r of s.table.rows) rows.push(r);
      if (s.table.rows.length === 0) rows.push([s.table.empty]);
    }
    rows.push([]);
  }
  return rows;
}
