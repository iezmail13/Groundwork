import { z } from "zod";
import { isIsoDate, isTime, isValidTimeZone } from "@/lib/dates";
import { PROJECT_COLOR_VALUES } from "@/lib/palette";

// Shared zod schemas. Every server action parses its input with one of these
// before touching the database; RLS is the second line of defence.

export const id = z.guid("Invalid reference.");
export const isoDate = z.string().refine(isIsoDate, "Use a valid date.");
export const time = z.string().refine(isTime, "Use a valid time (HH:MM).");
export const timeZone = z.string().max(64).refine(isValidTimeZone, "Unknown time zone.");
const optionalText = (max: number, message: string) => z.string().max(max, message).optional();

export const projectInput = z
  .object({
    organizationId: id,
    name: z.string({ error: "Add a name." }).min(1, "Add a name.").max(120, "Use 120 characters or fewer."),
    description: optionalText(4000, "Use 4,000 characters or fewer."),
    color: z.enum(PROJECT_COLOR_VALUES, { error: "Pick one of the colours." }).optional(),
    ownerMembershipId: id.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    path: ["endDate"],
    message: "The end date must be on or after the start date.",
  });

export const taskStatus = z.enum(["todo", "in_progress", "done"], { error: "Pick a status." });

export const taskCreateInput = z.object({
  organizationId: id,
  projectId: id.optional().refine((v) => v !== undefined, "Choose where this belongs."),
  title: z.string({ error: "Add a title." }).min(1, "Add a title.").max(200, "Use 200 characters or fewer."),
  status: taskStatus.optional(),
  dueDate: isoDate.optional(),
  assigneeMembershipId: id.optional(),
});

export const taskUpdateInput = z.object({
  id,
  projectId: id,
  title: z.string({ error: "Add a title." }).min(1, "Add a title.").max(200, "Use 200 characters or fewer."),
  description: optionalText(4000, "Use 4,000 characters or fewer."),
  status: taskStatus,
  dueDate: isoDate.optional(),
  assigneeMembershipId: id.optional(),
});

export const taskMoveInput = z.object({
  id,
  status: taskStatus,
  position: z.number().finite(),
});

export const eventInput = z
  .object({
    id: id.optional(),
    organizationId: id,
    title: z.string({ error: "Add a title." }).min(1, "Add a title.").max(200, "Use 200 characters or fewer."),
    description: optionalText(4000, "Use 4,000 characters or fewer."),
    location: optionalText(200, "Use 200 characters or fewer."),
    projectId: id.optional(),
    date: isoDate,
    endDate: isoDate.optional(),
    allDay: z.boolean(),
    startTime: time.optional(),
    endTime: time.optional(),
    timeZone,
  })
  .superRefine((d, ctx) => {
    if (d.allDay) {
      if (d.endDate && d.endDate < d.date) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end date must be on or after the start." });
      }
      return;
    }
    if (!d.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Add a start time." });
    if (!d.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Add an end time." });
    const end = d.endDate ?? d.date;
    if (d.startTime && d.endTime && `${end}T${d.endTime}` < `${d.date}T${d.startTime}`) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "The end must be after the start." });
    }
  });

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Mirrors the bucket allow-list in supabase/migrations/*_storage.sql. */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export const ACCEPT_ATTRIBUTE = [
  ...ALLOWED_MIME_TYPES,
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.md,.png,.jpg,.jpeg,.gif,.webp",
].join(",");

export const tagsInput = z
  .string()
  .max(400)
  .optional()
  .transform((value) =>
    Array.from(
      new Set(
        (value ?? "")
          .split(",")
          .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
          .filter(Boolean),
      ),
    ),
  )
  .pipe(
    z
      .array(z.string().max(40, "Keep each tag under 40 characters."))
      .max(20, "Use at most 20 tags."),
  );

export const uploadRequestInput = z.object({
  organizationId: id,
  fileName: z.string().min(1, "Choose a file.").max(255, "That file name is too long."),
  size: z
    .number()
    .int()
    .min(0)
    .max(MAX_UPLOAD_BYTES, "Files can be at most 25 MB."),
  mimeType: z.enum(ALLOWED_MIME_TYPES, { error: "That file type isn't supported." }),
});

export const documentInput = z.object({
  organizationId: id,
  storagePath: z.string().min(1).max(1024),
  name: z.string({ error: "Add a name." }).min(1, "Add a name.").max(255, "Use 255 characters or fewer."),
  projectId: id.optional(),
  tags: tagsInput,
});

export const documentUpdateInput = z.object({
  id,
  name: z.string({ error: "Add a name." }).min(1, "Add a name.").max(255, "Use 255 characters or fewer."),
  projectId: id.optional(),
  tags: tagsInput,
});

/** Keeps a readable, storage-safe file name: letters, digits, dot, dash, underscore. */
export function sanitizeFileName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-+\./g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
  return (base || "file").slice(0, 120);
}

export const slugInput = z
  .string()
  .min(1, "Add a slug.")
  .max(48, "Use 48 characters or fewer.")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, digits and dashes, not at the start or end.")
  .refine(
    (s) => !["login", "auth", "invite", "create-organization", "api", "logo", "favicon", "settings"].includes(s),
    "That slug is reserved.",
  );
