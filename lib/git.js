import { spawnSync } from 'child_process';

export function shallowClone(url, ref, destDir) {
  const result = spawnSync('git', ['clone', '--depth=1', '--branch', ref, url, destDir], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`git clone failed for ${url} @ ${ref}`);
  }
}

export function getLatestSemverTag(url, pattern) {
  const result = spawnSync('git', ['ls-remote', '--tags', url], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ls-remote failed for ${url}:\n${result.stderr}`);
  }

  const tagRegex = new RegExp(`^${pattern}$`);

  const tags = result.stdout
    .split('\n')
    .map(line => {
      // Lines are: <sha>\trefs/tags/<name>
      // Annotated tags also emit a refs/tags/<name>^{} line pointing at the commit;
      // we only want the tag name itself, not the dereference.
      const match = line.match(/refs\/tags\/([^\s^]+)$/);
      return match ? match[1] : null;
    })
    .filter(Boolean)
    .filter(tag => tagRegex.test(tag));

  if (!tags.length) {
    throw new Error(`No tags matching "${pattern}" found in ${url}`);
  }

  // Sort ascending by semver; last element is the highest version.
  tags.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return tags[tags.length - 1];
}
