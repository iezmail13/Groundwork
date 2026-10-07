import ts from "typescript";

// Primitive labels (defaults and every preset's words). If any of these shows
// up as user-facing text in a component, it bypasses t() and will not relabel
// when the preset or terminology changes.
export const PRIMITIVE_WORDS = [
  "project", "projects", "task", "tasks", "event", "events", "document", "documents",
  "member", "members", "program", "programs", "session", "sessions", "meeting", "meetings",
  "subject", "subjects", "lesson", "lessons", "tutor", "tutors", "material", "materials",
  "team member", "team members", "to do", "in progress",
];

const WORD_RE = new RegExp(`\\b(${PRIMITIVE_WORDS.map((w) => w.replace(" ", "\\s+")).join("|")})\\b`, "i");
const CAPITALISED_RE = new RegExp(
  `\\b(${PRIMITIVE_WORDS.map((w) => w[0]!.toUpperCase() + w.slice(1).replace(" ", "\\s+")).join("|")})\\b`,
);

// Strings passed to these calls are code, not copy: query strings, routes,
// cookie names, translation keys.
const CODE_CALLEES = new Set([
  "t", "select", "from", "eq", "neq", "in", "is", "order", "rpc", "textSearch", "or", "match", "contains",
  "revalidatePath", "redirect", "get", "set", "has", "delete", "upload", "remove", "createSignedUrl",
  "createSignedUploadUrl", "uploadToSignedUrl", "require", "getElementById", "querySelector", "push", "replace",
  "startsWith", "endsWith", "includes", "split", "join", "test", "fetch", "storage",
]);

// JSX attributes whose values are read by people or assistive tech.
const COPY_ATTRIBUTES = new Set(["aria-label", "aria-description", "placeholder", "title", "alt", "label", "aria-valuetext"]);

export type Violation = { file: string; line: number; text: string };

function isCodeLike(text: string): boolean {
  // identifiers, keys, paths and the like: no spaces, nothing capitalised
  return /^[a-z0-9_.:/\-[\]?=&#*,()]*$/.test(text);
}

function calleeName(node: ts.Node): string | undefined {
  let current: ts.Node = node;
  // walk up through template spans / parentheses to the call argument
  while (current.parent && (ts.isTemplateSpan(current.parent) || ts.isParenthesizedExpression(current.parent))) {
    current = current.parent;
  }
  const parent = current.parent;
  if (parent && ts.isTemplateExpression(parent)) return calleeName(parent);
  if (!parent || !ts.isCallExpression(parent) || !parent.arguments.includes(current as ts.Expression)) return undefined;
  const callee = parent.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

export function findViolations(fileName: string, source: string): Violation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations: Violation[] = [];

  const report = (node: ts.Node, text: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    violations.push({ file: fileName, line: line + 1, text: text.trim().replace(/\s+/g, " ").slice(0, 80) });
  };

  const checkString = (node: ts.Node, text: string) => {
    if (!WORD_RE.test(text)) return;
    const parent = node.parent;
    if (parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent))) return;
    if (parent && ts.isLiteralTypeNode(parent)) return;
    // property names like { "status.todo": ... } are keys, not copy
    if (parent && ts.isPropertyAssignment(parent) && parent.name === node) return;
    if (parent && ts.isJsxAttribute(parent)) {
      const attr = parent.name.getText(sf);
      if (COPY_ATTRIBUTES.has(attr)) report(node, text);
      else if (CAPITALISED_RE.test(text)) report(node, text);
      return;
    }
    const callee = calleeName(node);
    if (callee && CODE_CALLEES.has(callee)) return;
    if (isCodeLike(text)) return;
    if (CAPITALISED_RE.test(text) || /\s/.test(text)) report(node, text);
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      if (WORD_RE.test(node.text)) report(node, node.text);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      checkString(node, node.text);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      checkString(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return violations;
}
