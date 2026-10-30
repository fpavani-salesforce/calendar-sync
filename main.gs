/**
 * ============================================================================
 * AUTO-ADD TO CALENDAR INVITES
 * ============================================================================
 *
 * METHOD TO SCHEDULE: AddEmailToInvites (below)
 *
 * CONFIGURATION REQUIRED:
 *
 * 1. Enable Advanced Calendar API
 *    → Go to: https://developers.google.com/apps-script/guides/services/advanced
 *    → Enable the Calendar API service
 *
 * 2. Set Required Constants in config.gs. Make a copy of configTemplate.gs and name it config.gs so settings not in source control.
 *    → EMAIL_ADDRESS_TO_ADD (required)
 *      Mailbox that should show the blocked time. Internal events are forwarded
 *      to this address. Events with a participant outside AUTHORIZED_DOMAIN_SYNC
 *      become a new private "Busy" event instead, and the original invite is not changed.
 *
 *    → AUTHORIZED_DOMAIN_SYNC (optional)
 *      Comma-separated email domains that are safe to forward, e.g. "employer.com, client.com".
 *      Leave blank to forward every event.
 *
 *    → DAYS_IN_ADVANCE (optional, default: 14)
 *      Set to the number of days in advance to search your source calendar
 *      HINT: Use 1 or 2 to test then increase to 14 for reasonable future horizon
 *
 *    → SECONDARY_CALENDAR_ID (optional)
 *      Set to the ID of the secondary google calendar you want to use as source.
 *      Leave blank to use your running user's default calendar
 *      WARNING: While coded to support secondary calendars, it has not been used in a few versions so a fix may be needed. PRs welcome!
 *  
 *    → ERROR_NOTIFY_EMAIL 
 *      The email to be used to send any error reports.
 * 
 *    → DEBUG_MODE (optional, default: false)
 *      Set to true to enable debug mode. This will log more detailed information to the console.
 *      HINT: See Utilities.gs for more details.
 *  
 * ============================================================================
 */

/**
 * MAIN: Execute this function from the batch schedule run.
 */
function AddEmailToInvites() {
  Log.debug(`START main.gs:AddEmailToInvites()`);

  // Use either the secondary calendar or the default calendar of the running user
  const isSecondaryCalendar = Boolean(SECONDARY_CALENDAR_ID);
  if (isSecondaryCalendar) {
    calendar = CalendarApp.getCalendarById(SECONDARY_CALENDAR_ID);
    Log.info(`Using Calendar ID: ${calendar.getId()}`);
  } else {
    Log.info('No Calendar ID so using default calendar for running user');
    calendar = CalendarApp.getDefaultCalendar();
  }
  
  const allEvents = fetchEvents(calendar, DAYS_IN_ADVANCE);
  const eventList = filterEventsToSync(allEvents, EMAIL_ADDRESS_TO_ADD, isSecondaryCalendar);
  const internalEvents = [];
  const externalEvents = [];
  eventList.forEach(event => {
    if (hasExternalParticipant(event)) {
      externalEvents.push(event);
    } else {
      internalEvents.push(event);
    }
  });
  Log.info(`Internal events to forward: ${internalEvents.length}`);
  Log.info(`External events to block privately: ${externalEvents.length}`);

  const errorList = []
    .concat(sendInvites(calendar.getId(), internalEvents, EMAIL_ADDRESS_TO_ADD))
    .concat(sendPrivateBlocks(calendar.getId(), externalEvents, EMAIL_ADDRESS_TO_ADD))
    .concat(removeStalePrivateBlocks(calendar.getId(), allEvents));

  if (errorList.length > 0) {
    Log.error(`Error sending invites: ${errorList.length} errors found`);
    EmailNotify.sendErrors(errorList);
  } else {
    Log.info(`No errors found sending invites`);
  }
}

function CronScheduler() {
  AddEmailToInvites();
}