import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How ChurchConnect collects, uses, and protects your information.',
};

const EFFECTIVE_DATE = 'October 8, 2026';
const CONTACT_EMAIL = 'dev@encounterthelord.com';
const SITE_URL = 'https://encounter-connect.app';

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

export default function PrivacyPolicyPage() {
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
        Privacy Policy
      </h1>
      <p className="mt-2 text-xs text-foreground-subtle">Effective {EFFECTIVE_DATE}</p>

      <Section title="Overview">
        <p>
          ChurchConnect (&ldquo;ChurchConnect,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the connection platform
          available at {SITE_URL} (the &ldquo;Service&rdquo;), which churches use, each
          under its own name such as &ldquo;Encounter Connect,&rdquo; to help people
          connect to community and take next steps. Your church decides how it uses
          the Service with its people, and we handle your information on its behalf
          to run the Service. This Privacy Policy
          explains what information we collect, how we use it, and the choices you
          have. By using the Service, you agree to the practices described here.
        </p>
      </Section>

      <Section title="Information We Collect">
        <p>We collect the following categories of information:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Account information</strong> — your
            name, email address, and password when you create an account, and the
            church or campus you connect with.
          </li>
          <li>
            <strong className="text-foreground">Contact information</strong> — your
            mobile phone number, when you choose to provide it for text-message
            updates.
          </li>
          <li>
            <strong className="text-foreground">Journey and activity data</strong> —
            your progress through the steps your church assigns, assessment
            responses, appointment bookings, and related notes.
          </li>
          <li>
            <strong className="text-foreground">Gatherings</strong> — gatherings you
            host or RSVP to, including a gathering&rsquo;s place, and whether you came
            when a host checks people in.
          </li>
          <li>
            <strong className="text-foreground">Technical data</strong> — basic log
            and device information generated automatically when you use the Service,
            used to keep it secure and working.
          </li>
        </ul>
      </Section>

      <Section title="How We Use Your Information">
        <p>We use your information to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Provide, maintain, and operate the Service and your account;</li>
          <li>
            Connect you with your church, campus, and an assigned connector, and
            track your progress through your journey;
          </li>
          <li>
            Send you transactional communications by email and, with your consent, by
            text message (see below);
          </li>
          <li>Schedule and remind you about appointments and next steps;</li>
          <li>Secure the Service, prevent abuse, and comply with legal obligations.</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </Section>

      <Section title="Gatherings, Maps, and What Is Public">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Public gatherings</strong> can be
            seen by anyone, signed in or not, and may appear in search engines. A
            public gathering shows its title, time, place, and the host&rsquo;s first
            name and last initial. It shows a home&rsquo;s street address only when
            the host confirms they want it public and their church allows it.
          </li>
          <li>
            <strong className="text-foreground">Private gatherings</strong> are
            visible only to the people they are for. A private gathering at a home
            shares its street address only with people who say they are going.
          </li>
          <li>
            <strong className="text-foreground">Maps.</strong> A home is never
            placed on a map; a home gathering shows at its church&rsquo;s pin. We do
            not ask for or store your location.
          </li>
          <li>
            <strong className="text-foreground">Who sees your RSVP.</strong> A host
            sees the names of people who respond to their gathering. Other members
            going to the same private gathering, and members of the same group, see
            your first name and last initial. If you RSVP to another church&rsquo;s
            public gathering, its host sees your name and your church.
          </li>
          <li>
            <strong className="text-foreground">Messaging a host.</strong> When you
            message a host through the Service, we email them your message, your
            name, and your email address so they can reply. Hosts&rsquo; phone numbers
            and emails are never shown to you.
          </li>
        </ul>
      </Section>

      <Section title="SMS / Text Messaging">
        <p>
          If you provide your mobile phone number and opt in, we may send you
          transactional text messages related to your participation — for example,
          appointment confirmations and reminders, next-step prompts, and messages
          from your assigned connector.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Consent.</strong> Message consent is
            not a condition of any purchase or of using the Service. You opt in by
            providing your number and agreeing to receive messages.
          </li>
          <li>
            <strong className="text-foreground">Frequency.</strong> Message frequency
            varies based on your activity and your church&rsquo;s configuration.
          </li>
          <li>
            <strong className="text-foreground">Cost.</strong> Message and data rates
            may apply, depending on your mobile carrier and plan.
          </li>
          <li>
            <strong className="text-foreground">Opting out.</strong> Reply{' '}
            <strong className="text-foreground">STOP</strong> at any time to
            unsubscribe from text messages. Reply{' '}
            <strong className="text-foreground">HELP</strong> for help, or contact us
            at{' '}
            <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </li>
          <li>
            Carriers are not liable for delayed or undelivered messages.
          </li>
        </ul>
        <p>
          <strong className="text-foreground">
            No mobile information will be shared with third parties or affiliates for
            marketing or promotional purposes.
          </strong>{' '}
          Information sharing with subcontractors who support the Service (such as
          our messaging provider) is limited to delivering the messages you have
          requested. Text-messaging originator opt-in data and consent are never
          shared with any third parties for their own marketing.
        </p>
      </Section>

      <Section title="Email Communications">
        <p>
          We send transactional emails (such as account, scheduling, and next-step
          notices) through our email provider. You can manage or stop most
          non-essential emails through your account or by contacting us; some
          account-related emails are necessary to operate the Service.
        </p>
      </Section>

      <Section title="How We Share Information">
        <p>We share your information only as needed to run the Service:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Your church and its staff</strong> —
            the church and campus you connect with, and the connectors and
            administrators serving you, can see the information needed to guide your
            journey.
          </li>
          <li>
            <strong className="text-foreground">Other people at your church</strong>
            {' '}— hosts, group leaders, and members as described under
            &ldquo;Gatherings, Maps, and What Is Public.&rdquo;
          </li>
          <li>
            <strong className="text-foreground">Service providers</strong> — vendors
            who process data on our behalf under contract, including our hosting and
            database provider, email provider, and SMS provider. They may use your
            information only to provide services to us.
          </li>
          <li>
            <strong className="text-foreground">Maps and address lookup</strong>
            {' '}— to place church buildings and public venues on the map, we look up
            their addresses with OpenStreetMap&rsquo;s Nominatim service. Home
            addresses are never sent. Map images load from OpenFreeMap, which, like
            any website you visit, sees your device&rsquo;s IP address.
          </li>
          <li>
            <strong className="text-foreground">The platform operator</strong>
            {' '}— our staff can access church data when needed to run, support, and
            secure the Service.
          </li>
          <li>
            <strong className="text-foreground">Legal</strong> — when required by law
            or to protect the rights, safety, and security of users and the Service.
          </li>
        </ul>
        <p>We do not sell or rent your personal information to third parties.</p>
      </Section>

      <Section title="Data Retention">
        <p>
          We keep your information for as long as your account is active or as needed
          to provide the Service, and afterward only as required to comply with legal
          obligations, resolve disputes, and enforce our agreements. You may request
          deletion of your account and associated data as described below.
        </p>
      </Section>

      <Section title="Security">
        <p>
          We use reasonable administrative, technical, and organizational safeguards
          to protect your information. No method of transmission or storage is
          completely secure, however, and we cannot guarantee absolute security.
        </p>
      </Section>

      <Section title="Your Rights and Choices">
        <p>
          Depending on where you live, you may have the right to access, correct, or
          delete your personal information, and to opt out of certain communications.
          You can opt out of text messages by replying STOP. To exercise other
          rights, contact us at{' '}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="Children's Privacy">
        <p>
          The Service is not directed to children under 13, and we do not knowingly
          collect personal information from children under 13. If you believe a child
          has provided us information, please contact us so we can remove it. Where a
          church uses the Service with minors, it is responsible for obtaining any
          required parental consent.
        </p>
      </Section>

      <Section title="Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. When we do, we will
          revise the effective date above and, where appropriate, provide additional
          notice. Your continued use of the Service after changes take effect
          constitutes acceptance of the updated policy.
        </p>
      </Section>

      <Section title="Contact Us">
        <p>
          Questions about this Privacy Policy or your information? Contact us at{' '}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <footer className="mt-12 border-t border-border pt-6 text-xs text-foreground-subtle">
        <Link href="/terms" className="hover:text-foreground">
          Terms &amp; Conditions
        </Link>
        <span className="px-2">·</span>
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
      </footer>
    </main>
  );
}
