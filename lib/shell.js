// Wraps a string in single quotes for safe embedding in a shell command
// string, escaping any embedded single quotes (POSIX '\'' technique).
export function shellQuote(str) {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}
