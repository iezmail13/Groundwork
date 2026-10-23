// Adding several participants at once (D112): a pasted list becomes rows.

export type NewPersonRow = { name: string; email: string; phone: string; guardianName: string; emergencyContact: string };

/** One line's cells: tab-separated (a spreadsheet paste) or comma-separated with CSV quoting ("Doe, Jane"). */
function cells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === ",") {
      out.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

/** A first line that names the columns rather than a person. */
const HEADER = /^(full\s*)?name$/i;

/** "Name, email, phone, guardian, emergency contact" per line; commas (with quotes) or tabs. */
export function parsePastedPeople(text: string): NewPersonRow[] {
  const rows = text
    .split(/\r?\n/)
    .map(cells)
    .filter((c) => c.some(Boolean));
  if (rows.length && HEADER.test(rows[0]![0] ?? "")) rows.shift();
  return rows.map(([name = "", email = "", phone = "", guardianName = "", emergencyContact = ""]) => ({ name, email, phone, guardianName, emergencyContact }));
}
