# Calendar Sync (Google Apps Script)

A Google Apps Script that synchronizes calendar events in one direction from a Google Calendar to another calendar system (e.g., Outlook).

## Why It Exists

**Example use case:** You're working with a client who uses their own calendar system (e.g., Outlook). The calendar system is locked down for API access, so none of the standard calendar sync tools will work.<br>
You want to show your true calendar availability from within the client system's availability across:
- The client's calendar
- Your personal calendar
- Your employer's calendar

## Run Modes

1. **Default calendar** — Use your Google default calendar as the source
   - Simpliest to setup **but note**: All your calendar events will have the target email added as an attendee. Other people sending you invites may ask why you forwarded their invite to another email account. If this is not a concern for you, this is your best/easiest setup.
2. **Secondary calendar** — Use a secondary Google calendar as the source
   - Use a tool like [CalendarBridge](https://calendarbridge.com/) to sync all your calendars to a single secondary calendar that you will use as the sync source. This allows the following advantages for a small monthly subscription cost:
      -  Sync events from multiple calendars to your source calendar.
      -  People that send you invites will never see that you forwarded to your target email account.
      -  Using a tool like CalendarBridge allows you to not sync event details or, only sync once you've accepted the event. Just a couple examples.

## External participants

Forwarding an invite adds the target mailbox as a guest and notifies everyone already on the event. Set `AUTHORIZED_DOMAIN_SYNC` in `config.gs` when some of those guests should not see that.

```javascript
const AUTHORIZED_DOMAIN_SYNC = 'employer.com, client.com';
```

- Guests only on those domains are forwarded as before.
- Any other domain leaves the original event untouched. A new private event titled `Busy` is sent to `EMAIL_ADDRESS_TO_ADD` for the same time, with no title, description, or guest list from the source. The next run removes that block if the source event is cancelled or moved.
- Leave `AUTHORIZED_DOMAIN_SYNC` blank to keep forwarding every event.

## Prerequisites

- **Node.js** — Install via your package manager, for example:

  ```bash
  brew install node
  ```

- **Clasp CLI** — Google's command-line tool for Apps Script:

  ```bash
  npm install @google/clasp
  ```
  Use -g switch for global install. You can then omit `npm run` prefix from subseqent commans

## Setup

1. **Authenticate** to your Google account:
   ```bash
   npm run clasp login
   ```
   When prompted, allow Clasp to access your Google account.

2. **Create a Google Apps Script project:**
   ```bash
   npm run clasp create --type standalone --title "Calendar Sync <TARGET DOMAIN>"
   ```
   To use an existing project instead:
   ```bash
   npm run clasp clone <PROJECT ID>
   ```


3. **Update configuration** by copying `configTemplate.gs` to `config.gs` and setting `EMAIL_ADDRESS_TO_ADD`. Set `AUTHORIZED_DOMAIN_SYNC` when events with outside guests should become private busy blocks instead of forwarded invites.

4. **Push code** to the project:
   ```bash
   npm run clasp -- push
   ```

5. **Create a trigger** — Configure the script to run on a schedule:
   - Go to your [Google Apps Script Projects](https://script.google.com/home/projects)
   - Open your project
   - Create a trigger for `main.gs` to run on your desired schedule (e.g. Each night)

## Daily Commands

| Action | Command |
|--------|---------|
| Pull latest from server | `npm run clasp -- pull` |
| Push local changes | `npm run clasp -- push` |
| Create a version | `npm run clasp -- version "Release note"` |
| Deploy a version | `npm run clasp -- deploy --versionNumber <N> --description "Release note"` |

## Additional Resources

- [Google App Script Calendar API](https://developers.google.com/apps-script/reference/calendar)

### Recommended enhancements to generated clasp.json

```json
{
  "scriptId": "<PROJECT_ID_GENERATED>",
  "rootDir": "",
  "scriptExtensions": [".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": ["main.gs", "Utilities.gs", "FetchEvents.gs", "DomainRules.gs", "SkipRules.gs", "SendInvites.gs", "PrivateBlocks.gs"],
  "skipSubdirectories": false
}
```
