import { cancel, confirm, isCancel, multiselect, select, text } from '@clack/prompts';

function checkCancel(result) {
  if (isCancel(result)) {
    cancel('Cancelled.');
    process.exit(1);
  }
  return result;
}

export async function askText(label) {
  return checkCancel(await text({ message: label }));
}

export async function askConfirm(label) {
  return checkCancel(await confirm({ message: label, initialValue: false }));
}

export async function askMultiSelect(label, choices, { required = true, initialValues } = {}) {
  return checkCancel(
    await multiselect({
      message: label,
      options: choices.map(c => ({ value: c, label: c.name })),
      required,
      initialValues,
    })
  );
}

export async function askSelect(label, choices) {
  return checkCancel(
    await select({
      message: label,
      options: choices.map(c => ({ value: c, label: c.name ?? c })),
    })
  );
}

// No-op: @clack/prompts doesn't hold a persistent stdin handle open the way
// the old readline interface did, so there's nothing to release before
// spawning subprocess output.
export function closePrompts() {}
