import { requireAuth } from '@/lib/auth/dal';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getChurchContext } from '@/lib/church/context';
import { DeleteAccountForm, DetailsForm, EmailForm, PasswordForm } from './account-forms';

export default async function AccountPage() {
  const session = await requireAuth();
  const profile = session.profile;

  // An email change confirmed through the link lands here: carry the new
  // address onto the profile and the church's record of them.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authEmail = user?.email?.toLowerCase() ?? null;
  if (authEmail && profile && (profile.email ?? '').toLowerCase() !== authEmail) {
    const admin = await createServiceRoleClient();
    await admin.from('profiles').update({ email: authEmail }).eq('id', session.id);
    await admin.from('participants').update({ email: authEmail }).eq('profile_id', session.id);
  }

  const church = profile?.church_id ? await getChurchContext(profile.church_id) : null;
  const churchName = church?.name ?? 'your church';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Your account</h1>
        <p className="mt-1 text-sm text-foreground-muted">Your details are yours to change.</p>
      </header>
      <DetailsForm
        firstName={profile?.first_name ?? ''}
        lastName={profile?.last_name ?? ''}
        phone={profile?.phone ?? ''}
        texts={Boolean(profile?.sms_consent_at)}
        churchName={churchName}
      />
      <EmailForm email={authEmail ?? profile?.email ?? ''} />
      <PasswordForm />
      <DeleteAccountForm
        isStaff={Boolean(profile?.is_platform_admin) || (profile?.role ?? 'participant') !== 'participant'}
        churchName={churchName}
      />
    </div>
  );
}
