import Link from "next/link";

export default function OrgNotFound() {
  return (
    <div className="mx-auto my-16 max-w-lg border-y border-rule py-8">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-2 text-ink-muted">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/" className="mt-4 inline-block text-accent underline underline-offset-4">
        Go to my organizations
      </Link>
    </div>
  );
}
