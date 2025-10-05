import type { ESLint, Linter } from 'eslint';
import snapshotRequired from './rules/snapshot-required.js';

export const rules = {
  'snapshot-required': snapshotRequired,
};

const configs: { recommended: Linter.Config[] } = {
  recommended: [
    {
      plugins: {
        'svelte-state-snapshot-window': {
          rules,
        },
      },
      rules: {
        'svelte-state-snapshot-window/snapshot-required': 'error',
      },
    },
  ],
};

const svelteStateSnapshotWindowPlugin: ESLint.Plugin & {
  configs: {
    recommended: Linter.Config[];
  };
} = {
  rules,
  configs,
};

export default svelteStateSnapshotWindowPlugin;
