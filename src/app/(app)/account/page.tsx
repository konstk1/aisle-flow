import { redirect } from "next/navigation";
import { getServerSession } from "@/auth/access";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { PasswordForm } from "@/components/password-form";

export default async function AccountPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/account");
  return (
    <section className="card mx-auto mt-6 w-full max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Set password</h1>
      <p className="text-ink-400 mt-2 mb-6 text-sm leading-6">
        Set an Aisle Flow password to share access with family or an assistant.
        Setting a new password replaces the previous one.
      </p>
      {session.session.canManagePassword ? (
        <PasswordForm email={session.user.email} mode="set" />
      ) : (
        <div className="space-y-4">
          <p className="text-ink-700 text-sm">
            Sign in with Google to set or reset your password.
          </p>
          <GoogleSignInButton nextPath="/account" />
        </div>
      )}
    </section>
  );
}
