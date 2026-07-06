export function resolveCommandString(cmdDef) {
  return cmdDef.command ?? `npm run ${cmdDef.script}`;
}
