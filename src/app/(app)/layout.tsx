import { requirePageSession } from "@/auth/access";
import { AppShell } from "@/components/app-shell";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageSession();

  return <AppShell>{children}</AppShell>;
}
