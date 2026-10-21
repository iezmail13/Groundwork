// Adding several participants at once (D112): a pasted list becomes rows.

export type NewPersonRow = { name: string; email: string; phone: string; guardianName: string; emergencyContact: string };

/** "Name, email, phone, guardian, emergency contact" per line; commas or tabs (a spreadsheet paste). */
export function parsePastedPeople(text: string): NewPersonRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(line.includes("\t") ? "\t" : ",").map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
    .map(([name = "", email = "", phone = "", guardianName = "", emergencyContact = ""]) => ({ name, email, phone, guardianName, emergencyContact }));
}
