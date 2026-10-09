# Onboarding a church onto ChurchConnect

A runbook for bringing a church on, from the platform side and from the
church's side, ending with its first Sunday and first Monday. Written for
church #2 (Seminole, TX: 300-600 on a Sunday, Planning Center, a six-week
membership class) and church #3 (Loop, TX: 10-20 people, no Planning
Center, a handshake and a conversation).

Before any of this runs against production, migrations 029 through 035
must be applied there (see `docs/PROJECT_STATUS.md`).

---

## 1. Platform admin: create and hand over (about 15 minutes)

1. **Create the church** at `/platform/churches/new`: name, web address
   (the slug, e.g. `seminole`), and timezone. Creating it seeds its
   settings, its gathering types, and its three training lessons,
   including the five-minute host orientation.
2. **Add its campus** with a street address, so the campus gets a map pin.
   Campus addresses are looked up with OpenStreetMap; homes never are.
3. **Invite its first admin** from the church's page under
   `/platform/churches/[id]`. The email comes from the church's own name
   ("Seminole Connect") with a link to set their own password. Nobody
   types a password for anyone.
4. **Verify the church** on the same page once you know it is real. Only a
   verified church can appear on the shared map or be the front door's
   guess for a visitor. The test churches can never be verified.

## 2. Church admin: the first afternoon

The church admin lands on **This week**. Until it is done, a **Getting
started** card lists eight steps, each ticked off by the fact it asks for:

| Step | Where |
|---|---|
| Name your connect ministry | Settings, Church |
| Accept the church agreement | Settings, Church |
| Put your campus on the map | Campuses |
| Choose how you welcome people | Settings, Church (then Journey, Flows) |
| Invite your team | People, Invite someone |
| Bring in the people who already belong | People, Import people |
| Publish a first gathering | Gatherings, Host a gathering |
| Join the shared map | Settings, Church (needs verification) |

### Seminole: Planning Center, a membership class

- **Import the congregation.** In Planning Center People, export the
  people who belong (a list or all people) as CSV. In ChurchConnect, People,
  Import people: choose "People who already belong here". The columns are
  matched for you (Person ID, First Name, Last Name, Email, Mobile Phone
  Number, Created At); check them in the preview. Members come in as
  confirmed members and never show up as newcomers. Running the same file
  again later updates people instead of adding them twice.
- **Leave invites off on the first import.** Look the list over, then use
  "Send them now" on the import page. Invites go out a few dozen at a time
  over the next while, so nothing else waits behind them.
- **Recent visitors** go in as a second import, "New people to welcome",
  with their first-visit date mapped, so the seven-day contact clock is
  honest and nobody looks newer than they are.
- **The membership class** runs as gatherings, which already exist:
  1. Make a group called "Membership class".
  2. Host a gathering of type Class, private, aimed at that group, on
     Sunday at the class time, repeating for six weeks.
  3. Whoever leads it checks people in on the gathering page each week.
  4. When someone finishes, open their page and use "They already belong
     here". They become a confirmed member, out of the newcomer pipeline,
     and can host once they do the host orientation.
- **Welcome style**: "A journey we built" if you also want a written
  journey, or "Simple next steps" if the class is the journey.

### Loop: a handshake and a conversation

- **Welcome style**: "A handshake and a conversation, no journey". Nobody
  sees an empty journey.
- **People**: with 10-20 people, invite each member from People, Invite
  someone, choosing "Member". No import needed.
- **Hosting**: mark the people you trust as trusted hosts on their page;
  others can host once they do the host orientation in Learn.
- **Homes**: leave "Hosts may make a gathering at their home public" off
  unless the church wants it. Home gatherings stay private either way, and
  a home's address only reaches people who said they're going.

## 3. Sunday morning

**Before the service**

- Print the QR card: Settings, Church, "Your QR code". It opens the
  church's public page. Put it on a slide, in the bulletin, and on the
  welcome table.
- Make sure the connect team is invited and can sign in. Connectors see
  their people under Connector, My participants.

**What to say from the stage** (thirty seconds)

> "If you're new, scan the code on the screen. Tell us a little about you,
> and someone from our team will reach out this week. If you already call
> this place home, scan it too and choose 'I already belong to this
> church'. You'll see what's happening and can join a group."

**At the welcome table**

- New people choose **"I'm new here"**. They land in the newcomer
  pipeline, a connector is nudged if nobody reaches out in time, and a
  campus admin hears about it a few days later if the connector hasn't
  acted.
- Members choose **"I already belong to this church"**. They skip the
  welcome steps and wait in **This week** under "Says they belong" until
  an admin confirms them (one tap). Their own word gives them no standing;
  the admin's confirmation does.
- Texting is optional and asked for in plain words. Only people who agree
  get texts.

## 4. The first Monday

- **This week** shows who is new, who hasn't been reached, who has gone
  quiet, who isn't at a table yet, and who says they belong.
- The **weekly email** goes to admins on the church's chosen day. In a
  quiet week it says so once, with the QR link, instead of sending zeros.
- Connectors log a call or a coffee with one tap on a person's page.
  Meetings booked and held, and messages the app sends, count by
  themselves.

## 5. Texting

- **By default** a church texts from the platform's number, signed with
  its connect name. Nothing to set up.
- **Its own number**: register the church's own A2P brand and campaign
  inside the platform's Twilio account, attach the number (or a Messaging
  Service), then enter it under Settings, Church, Texting.
- **STOP and START**: Twilio stops texts the moment someone replies STOP.
  To keep our records in step, set each number's or Messaging Service's
  "A message comes in" webhook to `POST https://<site>/api/twilio/inbound`.
  If the site URL Twilio calls differs from `NEXT_PUBLIC_SITE_URL`, set
  `TWILIO_WEBHOOK_URL` to the exact URL. Without the webhook, a send to
  someone who replied STOP still turns their texts off when Twilio refuses
  it.

## 6. When something is off

| What you see | What to do |
|---|---|
| An invite link "is not valid" | It was replaced by a newer email, or withdrawn. Send it again from People. |
| An invite "has expired" | Links last 14 days. Send it again; the old link stops working. |
| Someone already has an account at another church | Belonging to more than one church comes later. Invite a different email for now. |
| A member shows as new | Open their page and use "They already belong here". |
| A newcomer said they belong | Open This week, "Says they belong", and choose "They're new". |
| The church isn't on the map | It needs both "Show our church on the shared map" and the platform's verification. |
| Emails aren't arriving | Settings, Notifications shows the outbox. Failed rows say why. |
