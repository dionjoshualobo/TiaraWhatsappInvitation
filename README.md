# QuizWiz WhatsApp Invitation Script

A Node.js script for event coordinators to send WhatsApp group invitations to people registered for an event.

The script reads the latest registration `.xlsx` file, identifies participants who have not previously been processed, and sends them the WhatsApp group invitation. A local history file prevents the same contact from being processed again.

## Features

* Reads registrations directly from an `.xlsx` file
* Automatically identifies new registrations
* Prevents duplicate invitations across multiple spreadsheet downloads
* Validates Indian mobile numbers
* Handles duplicate phone numbers within the same spreadsheet
* Supports `--dry-run` for testing without sending messages
* Supports `--limit=N` for controlled testing/batches
* Supports `-m` / `--message` to print the exact message each person would receive
* Shows the participants before sending
* Requires confirmation before sending
* Saves processing history immediately after each successful message
* Keeps event data and WhatsApp credentials local to each coordinator

---

## 1. Requirements

Install:

* [Node.js](https://nodejs.org/)
* A WhatsApp account that will be used to send the invitations

Check Node.js and npm:

```bash
node --version
npm --version
```

---

## 2. Clone the repository

```bash
git clone <REPOSITORY_URL>
cd <REPOSITORY_NAME>
```

Install dependencies:

```bash
npm install
```

---

## 3. Configure the event

Open:

```text
script.js
```

Find:

```js
const GROUP_INVITE_LINK = "YOUR_GROUP_INVITE_LINK";
```

Replace it with the WhatsApp group invite link for your event.

For example:

```js
const GROUP_INVITE_LINK = "https://chat.whatsapp.com/XXXXXXXX";
```

### Registration columns

The script currently expects these columns in the exported spreadsheet:

```js
const REQUIRED_COLUMNS = [
    'Name',
    'Email',
    'College',
    'Contact'
];
```

The names must match the column names in the XLSX export.

If your event platform uses different column names, update the script accordingly.

---

## 4. Add the registration spreadsheet

Download the latest registration list from the event website.

Rename it:

```text
registrations.xlsx
```

Place it in the project directory:

```text
QuizWizScript/
├── script.js
├── package.json
├── package-lock.json
└── registrations.xlsx
```

The spreadsheet can contain **all registrations**, including people who have already received an invitation.

The script will automatically determine which contacts are new.

---

## 5. Run a dry run

Before sending anything, run:

```bash
node script.js --dry-run
```

This will:

1. Read the spreadsheet.
2. Validate the columns.
3. Validate phone numbers.
4. Compare registrations against the local history.
5. Display the participants who would receive an invitation.

**No WhatsApp messages are sent in dry-run mode.**

---

## 6. Test with a small number

You can limit the number of participants processed:

```bash
node script.js --dry-run --limit=3
```

This is useful for checking the first few registrations before running the full list.

---

## 7. Link WhatsApp

Once the dry run looks correct, test with one participant:

```bash
node script.js --limit=1
```

The script will display a QR code if the WhatsApp account has not been linked.

On the phone containing the WhatsApp account:

1. Open WhatsApp.
2. Open **Linked Devices**.
3. Select **Link a Device**.
4. Scan the QR code displayed in the terminal.

The WhatsApp authentication information is stored locally in:

```text
auth_info_baileys/
```

You do not need to scan the QR code every time unless the session is logged out or needs to be re-linked.

---

## 8. Confirm the participants

Before sending, the script displays the people who will receive an invitation.

For example:

```text
--- New Participants to Message ---

1. Alice — 9876543210 → 919876543210 — SJEC
2. Bob — 9123456780 → 919123456780 — NITK

Total: 2

Send WhatsApp invitations to these 2 participants? [y/N]:
```

Enter:

```text
y
```

to proceed.

Enter anything else to cancel.

---

## 9. Processing history

The script maintains a local file:

```text
sent_log.json
```

You **do not need to create this file manually**.

If it does not exist, the script automatically creates it with:

```json
{}
```

After an invitation is successfully processed, the file contains information about that contact.

This allows the script to distinguish between old and new registrations.

### Important

Do **not delete `sent_log.json`** during an event.

Deleting it will make the script treat previously processed participants as new.

---

## 10. Handling new registrations

Suppose the first spreadsheet contains:

```text
Alice
Bob
Charlie
```

You run the script and they are processed.

Later, the event website contains:

```text
Alice
Bob
Charlie
David
Eve
```

Download the new spreadsheet and replace:

```text
registrations.xlsx
```

Then run:

```bash
node script.js --dry-run
```

The script will recognize:

```text
Alice    → already processed
Bob      → already processed
Charlie  → already processed
David    → new
Eve      → new
```

Only David and Eve will be placed in the new-message queue.

Run:

```bash
node script.js
```

to send their invitations.

---

## 11. Using `--limit`

You can limit how many new participants are processed:

```bash
node script.js --limit=5
```

If there are 100 new participants, only the first 5 will be processed.

The remaining 95 are **not marked as processed**, so they will remain available for the next run.

For testing:

```bash
node script.js --dry-run --limit=3
```

---

## 12. Previewing the message (`-m` / `--message`)

To see the exact message a participant would receive without sending anything:

```bash
node script.js --message
```

The short form works too:

```bash
node script.js -m
```

For each queued participant the script prints the recipient and the full message body:

```text
--- Messages that would be sent ---

────────────────────────────────────────────────────
[1/2] To: Abhinav shetty — 919686043131
────────────────────────────────────────────────────
Hi Abhinav shetty!

Thank you for registering for QuizWiz.

Please join our official WhatsApp group for updates: https://chat.whatsapp.com/XXXXXXXX
```

Notes:

* Nothing is sent and WhatsApp is never connected, so no QR code appears.
* `sent_log.json` is not modified.
* It prints messages for the participants in the queue only, so contacts already processed are skipped.
* It respects `--limit`:

```bash
node script.js --message --limit=3
```

* The preview comes from the same message builder used when sending, so it always matches what goes out.

To change the message text, edit `buildMessage()` in `script.js`:

```js
function buildMessage(Name) {
    return `Hi ${Name}!\n\nThank you for registering for QuizWiz....`;
}
```

---

## 13. Duplicate phone numbers

The script uses the normalized phone number as the unique identifier.

If the spreadsheet contains:

```text
Alice    9876543210
Bob      9876543210
```

the same WhatsApp number will only be processed once.

Likewise, these formats are normalized to the same number:

```text
9876543210
09876543210
919876543210
```

---

## 14. Files that should stay local

The following files contain event-specific or private information:

```text
registrations.xlsx
sent_log.json
auth_info_baileys/
```

They should **not** be committed to GitHub.

Add them to `.gitignore`:

```gitignore
node_modules/
registrations.xlsx
sent_log.json
auth_info_baileys/
```

The repository should contain the code and configuration, while each coordinator keeps their own registration data, processing history, and WhatsApp session.

---

## 15. Normal workflow

After the initial setup, the workflow is:

```text
Download latest registrations.xlsx
              ↓
Replace old registrations.xlsx
              ↓
node script.js --dry-run
              ↓
Review new participants
              ↓
node script.js
              ↓
Confirm with "y"
              ↓
WhatsApp invitations sent
              ↓
sent_log.json updated
```

Repeat this whenever new registrations need to be processed.

---

## 16. Setting up another event

Each event coordinator can use the same GitHub repository.

They only need to:

```bash
git clone <REPOSITORY_URL>
cd <REPOSITORY_NAME>
npm install
```

Then:

1. Set their event's WhatsApp group invite link.
2. Download their event's registration XLSX.
3. Rename it to `registrations.xlsx`.
4. Run `node script.js --dry-run`.
5. Test with `node script.js --limit=1`.
6. Link their WhatsApp account.
7. Run the script normally.

Each coordinator will automatically get their own local:

```text
sent_log.json
```

and:

```text
auth_info_baileys/
```

so different coordinators do not share registration history or WhatsApp sessions.

