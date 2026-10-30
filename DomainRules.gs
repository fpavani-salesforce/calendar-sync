/**
 * Domain rules. Decides when an event must become a private busy block
 * instead of forwarding the original invite.
 */

/**
 * Parses a comma-separated domain list. A full email is reduced to its domain.
 * @param {string} value
 * @returns {string[]}
 */
function parseAuthorizedDomains(value) {
  return String(value || '')
    .split(',')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .map(part => (part.includes('@') ? part.split('@').pop() : part.replace(/^@/, '')));
}

/**
 * @param {string} email
 * @returns {string}
 */
function emailDomain(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at < 0 || at === normalized.length - 1) {
    return '';
  }
  return normalized.slice(at + 1);
}

/**
 * Rooms and Google calendar resources are not client participants.
 * @param {string} email
 * @returns {boolean}
 */
function isIgnorableParticipant(email) {
  const domain = emailDomain(email);
  return domain === 'resource.calendar.google.com'
    || domain === 'group.calendar.google.com'
    || domain === 'calendar.google.com';
}

/**
 * @param {string} email
 * @param {string[]} authorizedDomains
 * @returns {boolean}
 */
function isAuthorizedEmail(email, authorizedDomains) {
  const domain = emailDomain(email);
  if (!domain) {
    return false;
  }
  return authorizedDomains.some(authorized => domain === authorized || domain.endsWith('.' + authorized));
}

/**
 * True when any participant sits outside the authorized domains.
 * The sync target and calendar resources are ignored.
 * @param {string[]} emails
 * @param {string} authorizedDomainsRaw
 * @param {string} targetEmail
 * @returns {boolean}
 */
function participantNeedsPrivateBlock(emails, authorizedDomainsRaw, targetEmail) {
  const authorized = parseAuthorizedDomains(authorizedDomainsRaw);
  // Blank allowlist keeps the original behavior: forward every invite.
  if (authorized.length === 0) {
    return false;
  }
  const target = String(targetEmail || '').trim().toLowerCase();
  const relevant = (emails || [])
    .map(email => String(email || '').trim().toLowerCase())
    .filter(Boolean)
    .filter(email => email !== target)
    .filter(email => !isIgnorableParticipant(email));

  return relevant.some(email => !isAuthorizedEmail(email, authorized));
}

/**
 * @param {CalendarEvent} event
 * @returns {string[]}
 */
function collectParticipantEmails(event) {
  const emails = [];
  (event.getGuestList() || []).forEach(guest => {
    if (guest.getEmail()) {
      emails.push(guest.getEmail());
    }
  });
  (event.getCreators() || []).forEach(creator => emails.push(creator));
  return emails;
}

/**
 * @param {CalendarEvent} event
 * @returns {boolean}
 */
function hasExternalParticipant(event) {
  return participantNeedsPrivateBlock(
    collectParticipantEmails(event),
    AUTHORIZED_DOMAIN_SYNC,
    EMAIL_ADDRESS_TO_ADD
  );
}

/**
 * Domains on the event that are outside the authorized list.
 * @param {CalendarEvent} event
 * @returns {string[]}
 */
function externalDomainsOnEvent(event) {
  const authorized = parseAuthorizedDomains(AUTHORIZED_DOMAIN_SYNC);
  const target = String(EMAIL_ADDRESS_TO_ADD || '').trim().toLowerCase();
  const domains = {};

  collectParticipantEmails(event).forEach(email => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || normalized === target || isIgnorableParticipant(normalized)) {
      return;
    }
    if (isAuthorizedEmail(normalized, authorized)) {
      return;
    }
    domains[emailDomain(normalized) || normalized] = true;
  });

  return Object.keys(domains);
}
