// Builds the window/tab name from the task description, prefixed with the
// ticket's number segment (the part after the first hyphen) when a ticket is
// given, e.g. description "AGL leaderboard" + ticket "DEV-10224" -> "10224-agl-leaderboard".
// Either input may be blank (caller enforces that at least one is present).
export function buildWindowName(description, ticket) {
  const slug = description ? toKebabCase(description) : '';
  const ticketNumber = ticket ? (ticket.split('-')[1] ?? ticket) : '';

  if (ticketNumber && slug) return `${ticketNumber}-${slug}`;
  return ticketNumber || slug;
}

function toKebabCase(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
