import * as tmux from './backends/tmux.js';
import * as zellij from './backends/zellij.js';

const BACKENDS = { tmux, zellij };

export function getMultiplexer(name) {
  const backend = BACKENDS[name ?? 'tmux'];
  if (!backend) throw new Error(`Unknown multiplexer "${name}". Expected "tmux" or "zellij".`);
  return backend;
}
