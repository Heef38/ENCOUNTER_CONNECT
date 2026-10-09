import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { PLATFORM_CONTACT_EMAIL, PLATFORM_NAME } from '@/lib/brand';
import { CHURCH_AGREEMENT_VERSION } from '@/lib/church/agreement';

export const metadata: Metadata = {
  title: 'Church agreement',
  description: `What a church and ${PLATFORM_NAME} each agree to.`,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-foreground-muted">{children}</div>
    </section>
  );
}

/**
 * The one-page agreement between a church and the platform (rethink §7.9).
 * Plain words, one page. A church admin accepts it for the church in
 * Church settings, and the version accepted is recorded.
 */
export default function ChurchAgreementPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground">
        <ChevronLeft className="h-3 w-3" />
        Back to home
      </Link>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Church agreement</h1>
      <p className="mt-2 text-xs text-foreground-subtle">Version {CHURCH_AGREEMENT_VERSION}</p>
      <p className="mt-4 text-sm leading-relaxed text-foreground-muted">
        This is the agreement between a church that uses {PLATFORM_NAME} and {PLATFORM_NAME}. It sits alongside the{' '}
        <Link href="/terms" className="text-primary hover:underline">Terms</Link> and the{' '}
        <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>, which every person using the
        service agrees to.
      </p>

      <Section title="Whose information it is">
        <p>
          Your church&apos;s information about its people belongs to your church. Your church decides how it uses the service
          with its people. {PLATFORM_NAME} holds and processes that information for your church, only to run, support and
          secure the service.
        </p>
        <p>
          Each person owns their own account details. They can change them, or delete their account, at any time. When
          someone deletes their account, your church keeps its records of its ministry with them, with their name and
          contact details removed.
        </p>
      </Section>

      <Section title="What your church agrees to">
        <ul className="list-disc space-y-1 pl-5">
          <li>Invite and import only people who would expect to hear from your church.</li>
          <li>Text only people who have agreed to texts, and stop when they say stop.</li>
          <li>
            Keep gatherings for minors under the youth rules the service enforces: a staff host, private, and the address
            held until people reply.
          </li>
          <li>Look after the reports about your gatherings, and act on safety concerns.</li>
          <li>Give staff roles only to people your church trusts with people&apos;s information.</li>
          <li>Keep your church&apos;s public details accurate.</li>
        </ul>
      </Section>

      <Section title="What ChurchConnect agrees to">
        <ul className="list-disc space-y-1 pl-5">
          <li>Keep each church&apos;s information separate from every other church&apos;s.</li>
          <li>Never sell your church&apos;s or your people&apos;s information.</li>
          <li>Look at your church&apos;s information only to run, support or secure the service, or when the law requires it.</li>
          <li>Use reasonable safeguards, and tell your church promptly if its information is exposed.</li>
          <li>Never send a home address to a map or address-lookup service.</li>
          <li>Let your church export its information at any time, from Church settings.</li>
        </ul>
      </Section>

      <Section title="Leaving">
        <p>
          Your church can stop using the service at any time. Export your information first. On request, {PLATFORM_NAME}{' '}
          deletes your church&apos;s information within 30 days, except what the law requires us to keep.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this agreement changes, your church&apos;s admins are asked to accept the new version. Questions go to{' '}
          <span className="font-medium text-foreground">{PLATFORM_CONTACT_EMAIL}</span>.
        </p>
      </Section>
    </main>
  );
}
