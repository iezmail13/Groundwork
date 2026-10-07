import { File, FileImage, FileSpreadsheet, FileText, Presentation } from "lucide-react";

export function FileIcon({ mime, className = "size-5" }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <FileImage aria-hidden className={className} />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return <FileSpreadsheet aria-hidden className={className} />;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return <Presentation aria-hidden className={className} />;
  if (mime.startsWith("text/") || mime.includes("pdf") || mime.includes("word") || mime.includes("opendocument.text") || mime.includes("rtf"))
    return <FileText aria-hidden className={className} />;
  return <File aria-hidden className={className} />;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KINDS: [test: (m: string) => boolean, label: string][] = [
  [(m) => m === "application/pdf", "PDF"],
  [(m) => m.includes("word") || m.includes("opendocument.text") || m.includes("rtf"), "Word"],
  [(m) => m.includes("sheet") || m.includes("excel"), "Spreadsheet"],
  [(m) => m === "text/csv", "CSV"],
  [(m) => m.includes("presentation") || m.includes("powerpoint"), "Slides"],
  [(m) => m === "text/markdown", "Markdown"],
  [(m) => m.startsWith("text/"), "Text"],
  [(m) => m.startsWith("image/"), "Image"],
];

export function fileKind(mime: string): string {
  return KINDS.find(([test]) => test(mime))?.[1] ?? "File";
}
