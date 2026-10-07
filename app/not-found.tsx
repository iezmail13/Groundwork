import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";

export default function NotFound() {
  return (
    <AuthFrame title="Page not found" subtitle="The link may be broken, or the page may have moved.">
      <Link href="/" className="underline underline-offset-4">
        Go to Groundwork
      </Link>
    </AuthFrame>
  );
}
