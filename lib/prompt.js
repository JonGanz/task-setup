import readline from 'readline';

let rl;

function getRl() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

export function closePrompts() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

function ask(prompt) {
  return new Promise(resolve => getRl().question(prompt, answer => resolve(answer.trim())));
}

export async function askText(label) {
  return ask(`${label}: `);
}

export async function askConfirm(label) {
  const answer = await ask(`${label} [y/N]: `);
  return answer.toLowerCase() === 'y';
}

export async function askMultiSelect(label, choices) {
  console.log(`\n${label}`);
  choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.name}`));

  const input = await ask('Select (e.g. 1,3 or all): ');

  if (input.toLowerCase() === 'all') return [...choices];

  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error('No repos selected.');

  const indices = parts.map(s => parseInt(s, 10) - 1);
  const invalid = indices.filter(i => isNaN(i) || i < 0 || i >= choices.length);
  if (invalid.length) {
    throw new Error(`Invalid selection: ${invalid.map(i => i + 1).join(', ')}. Valid range: 1–${choices.length}`);
  }

  return indices.map(i => choices[i]);
}
