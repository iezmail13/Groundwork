import { redirect } from "next/navigation";

export default async function OrgIndex({ params }: PageProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/dashboard`);
}
