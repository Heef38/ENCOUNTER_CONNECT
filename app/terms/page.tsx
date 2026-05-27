import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'The terms that govern your use of Encounter Connect.',
};

const EFFECTIVE_DATE = 'May 27, 2026';
const CONTACT_EMAIL = 'dev@encounterthelord.com';
const SITE_URL = 'https://encounter-connect.app';
const GOVERNING_LAW = 'the State of Texas';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground-muted">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to home
      </Link>

      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Terms &amp; Conditions
      </h1>
      <p className="mt-2 text-xs text-foreground-subtle">Effective {EFFECTIVE_DATE}</p>

      <Section title="1. Acceptance of These Terms">
        <p>
          These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access to and
          use of Encounter Connect (the &ldquo;Service&rdquo;), available at{' '}
          {SITE_URL}, operated by Encounter Connect (&ldquo;we,&rdquo;
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By creating an account or using the
          Service, you agree to these Terms and to our{' '}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          . If you do not agree, do not use the Service.
        </p>
      </Section>

      <Section title="2. The Service">
        <p>
          Encounter Connect is a platform that churches use to help people connect to
          community and take next steps — including guided journeys, assessments,
          scheduling meetings with a connector, and related communications. Your
          church configures much of how the Service works for you.
        </p>
      </Section>

      <Section title="3. Accounts and Eligibility">
        <p>
          You must provide accurate information when creating an account and keep your
          login credentials secure. You are responsible for activity that occurs under
          your account. You must be at least 13 years old to create an account; where
          a church uses the Service with minors, it is responsible for obtaining any
          required parental consent.
        </p>
      </Section>

      <Section title="4. Text Messaging Program">
        <p>
          By providing your mobile phone number and opting in, you consent to receive
          recurring transactional text messages from Encounter Connect related to your
          participation, such as appointment confirmations and reminders, next-step
          prompts, and messages from your assigned connector.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Consent to receive text messages is not a condition of using the Service.</li>
          <li>Message frequency varies based on your activity.</li>
          <li>Message and data rates may apply.</li>
          <li>
            Reply <strong className="text-foreground">STOP</strong> at any time to
            unsubscribe, or <strong className="text-foreground">HELP</strong> for help.
            You may also contact us at{' '}
            <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </li>
          <li>Carriers are not liable for delayed or undelivered messages.</li>
        </ul>
        <p>
          For details on how we handle the information in our messaging program, see
          our{' '}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section title="5. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Use the Service for any unlawful purpose or in violation of these Terms;</li>
          <li>
            Access accounts or data that are not yours, or attempt to disrupt,
            probe, or compromise the Service;
          </li>
          <li>Upload malicious code or interfere with other users&rsquo; use of the Service;</li>
          <li>
            Misrepresent your identity or use the Service to harass, abuse, or harm
            others.
          </li>
        </ul>
      </Section>

      <Section title="6. Intellectual Property">
        <p>
          The Service, including its software, design, and content we provide, is
          owned by Encounter Connect or its licensors and is protected by applicable
          laws. We grant you a limited, non-exclusive, non-transferable right to use
          the Service for its intended purpose. Content you submit remains yours; you
          grant us the rights needed to operate the Service.
        </p>
      </Section>

      <Section title="7. Third-Party Services">
        <p>
          The Service relies on third-party providers (for example, hosting, email,
          and SMS delivery). Your use of the Service may be subject to those
          providers&rsquo; terms, and we are not responsible for third-party services
          we do not control.
        </p>
      </Section>

      <Section title="8. Disclaimers">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo;
          without warranties of any kind, whether express or implied, including
          implied warranties of merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that the Service will be uninterrupted,
          error-free, or secure.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>
          To the fullest extent permitted by law, Encounter Connect and its operators
          will not be liable for any indirect, incidental, special, consequential, or
          punitive damages, or for any loss of data, arising out of or relating to
          your use of the Service. Our total liability for any claim relating to the
          Service will not exceed the amount you paid us, if any, in the twelve months
          before the claim.
        </p>
      </Section>

      <Section title="10. Indemnification">
        <p>
          You agree to indemnify and hold harmless Encounter Connect from any claims,
          losses, or expenses arising out of your use of the Service or your violation
          of these Terms.
        </p>
      </Section>

      <Section title="11. Changes to the Service and Terms">
        <p>
          We may modify or discontinue the Service, and we may update these Terms from
          time to time. When we update the Terms, we will revise the effective date
          above. Your continued use of the Service after changes take effect
          constitutes acceptance of the updated Terms.
        </p>
      </Section>

      <Section title="12. Governing Law">
        <p>
          These Terms are governed by the laws of {GOVERNING_LAW}, without regard to
          its conflict-of-laws rules. You agree to the exclusive jurisdiction of the
          courts located there for any dispute arising out of these Terms or the
          Service.
        </p>
      </Section>

      <Section title="13. Contact Us">
        <p>
          Questions about these Terms? Contact us at{' '}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <footer className="mt-12 border-t border-border pt-6 text-xs text-foreground-subtle">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy Policy
        </Link>
        <span className="px-2">·</span>
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
      </footer>
    </main>
  );
}
