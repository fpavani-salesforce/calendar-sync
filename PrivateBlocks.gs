/**
 * Private busy blocks. Creates a new event for the target mailbox instead of
 * adding that mailbox to the original invite.
 */

const PRIVATE_BLOCK_KIND = 'busy-block';
const PRIVATE_BLOCK_TITLE = 'Busy';

/**
 * Stable id for one source occurrence. Recurring instances share an iCal UID,
 * so the start time is part of the key.
 * @param {CalendarEvent} event
 * @returns {string}
 */
function privateBlockSourceKey(event) {
  const raw = `${event.getId()}|${event.getStartTime().getTime()}`;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return bytes.map(byte => {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

/**
 * @param {string} calendarId
 * @param {CalendarEvent[]} eventList
 * @param {string} email
 * @returns {ErrorItem[]}
 */
function sendPrivateBlocks(calendarId, eventList, email) {
  Log.debug(`START PrivateBlocks.gs:sendPrivateBlocks(): calendarId: ${calendarId} | eventList: ${eventList.length}`);
  const errorList = [];

  for (const event of eventList) {
    const sourceKey = privateBlockSourceKey(event);
    try {
      if (findPrivateBlock(calendarId, sourceKey)) {
        Log.info(`SKIPPING - Private block already exists | source: ${sourceKey}`);
        continue;
      }
      createPrivateBlock(calendarId, event, email, sourceKey);
      Log.info(`PRIVATE BLOCK sent to ${email} | domains: ${externalDomainsOnEvent(event).join(', ')} | source: ${sourceKey}`);
    } catch (error) {
      const errorMessage = `Error creating private block for event ${event.getId()}: ${error.message}`;
      Log.error(errorMessage);
      errorList.push(new ErrorItem(event.getId(), errorMessage, getEventStartDate(event)));
    }
  }

  return errorList;
}

/**
 * Removes busy blocks in the current window whose source event is gone,
 * moved, or no longer has an external participant. The cancellation goes
 * only to the block's own guest.
 * @param {string} calendarId
 * @param {CalendarEvent[]} allEvents
 * @returns {ErrorItem[]}
 */
function removeStalePrivateBlocks(calendarId, allEvents) {
  const errorList = [];
  const activeKeys = {};
  allEvents.forEach(event => {
    if (!eventStillNeedsPrivateBlock(event)) {
      return;
    }
    activeKeys[privateBlockSourceKey(event)] = true;
  });

  const timeMin = new Date();
  const timeMax = getDateRangeEnd(DAYS_IN_ADVANCE);
  let blocks = [];
  try {
    blocks = listPrivateBlocks(calendarId, timeMin, timeMax);
  } catch (error) {
    const errorMessage = `Error listing private blocks: ${error.message}`;
    Log.error(errorMessage);
    errorList.push(new ErrorItem('private-blocks', errorMessage, timeMin));
    return errorList;
  }

  blocks.forEach(block => {
    const sourceKey = block.extendedProperties
      && block.extendedProperties.private
      && block.extendedProperties.private.syncSourceId;
    if (!sourceKey || activeKeys[sourceKey]) {
      return;
    }
    try {
      Calendar.Events.remove(calendarId, block.id, { sendUpdates: 'all' });
      Log.info(`Removed stale private block ${block.id} | source: ${sourceKey}`);
    } catch (error) {
      const errorMessage = `Error removing stale private block ${block.id}: ${error.message}`;
      Log.error(errorMessage);
      errorList.push(new ErrorItem(block.id, errorMessage, getEventStartDate(block)));
    }
  });

  return errorList;
}

/**
 * @param {CalendarEvent} event
 * @returns {boolean}
 */
function eventStillNeedsPrivateBlock(event) {
  if (event.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT) {
    return false;
  }
  if (event.getEventType() !== CalendarApp.EventType.DEFAULT) {
    return false;
  }
  return hasExternalParticipant(event);
}

/**
 * @param {string} calendarId
 * @param {string} sourceKey
 * @returns {Object|undefined}
 */
function findPrivateBlock(calendarId, sourceKey) {
  const response = Calendar.Events.list(calendarId, {
    privateExtendedProperty: `syncSourceId=${sourceKey}`,
    singleEvents: true,
    showDeleted: false,
    maxResults: 5
  });
  return (response.items || []).find(item => item.status !== 'cancelled');
}

/**
 * @param {string} calendarId
 * @param {Date} timeMin
 * @param {Date} timeMax
 * @returns {Object[]}
 */
function listPrivateBlocks(calendarId, timeMin, timeMax) {
  const items = [];
  let pageToken;
  do {
    const response = Calendar.Events.list(calendarId, {
      privateExtendedProperty: `syncKind=${PRIVATE_BLOCK_KIND}`,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      showDeleted: false,
      maxResults: 250,
      pageToken: pageToken
    });
    items.push.apply(items, response.items || []);
    pageToken = response.nextPageToken;
  } while (pageToken);
  return items;
}

/**
 * Inserts a new private event. The original event is not modified.
 * @param {string} calendarId
 * @param {CalendarEvent} event
 * @param {string} email
 * @param {string} sourceKey
 */
function createPrivateBlock(calendarId, event, email, sourceKey) {
  const resource = {
    summary: PRIVATE_BLOCK_TITLE,
    visibility: 'private',
    transparency: 'opaque',
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    attendees: [{ email: email }],
    reminders: { useDefault: false },
    extendedProperties: {
      private: {
        syncKind: PRIVATE_BLOCK_KIND,
        syncSourceId: sourceKey
      }
    }
  };

  if (event.isAllDayEvent()) {
    const zone = Session.getScriptTimeZone();
    resource.start = { date: Utilities.formatDate(event.getAllDayStartDate(), zone, 'yyyy-MM-dd') };
    resource.end = { date: Utilities.formatDate(event.getAllDayEndDate(), zone, 'yyyy-MM-dd') };
  } else {
    resource.start = { dateTime: event.getStartTime().toISOString() };
    resource.end = { dateTime: event.getEndTime().toISOString() };
  }

  Calendar.Events.insert(resource, calendarId, { sendUpdates: 'all' });
}
