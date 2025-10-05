# eslint-plugin-svelte-state-snapshot-window

ESLint plugin to enforce `$state.snapshot()` usage when passing Svelte `$state` variables (non-primitives only) to `window.*` calls (Electron IPC).

## Why?

Svelte's `$state` creates reactive proxies that cannot be serialized for Electron IPC. This plugin ensures you wrap them with `$state.snapshot()` before sending.

## Installation

```bash
npm install --save-dev eslint-plugin-svelte-state-snapshot-window
```

## Configuration

### For Svelte + TypeScript Projects (Recommended)

```javascript
// eslint.config.js
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import tsParser from '@typescript-eslint/parser';
import svelteStateSnapshot from 'eslint-plugin-svelte-state-snapshot-window';

export default [
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
        project: './tsconfig.json',
        extraFileExtensions: ['.svelte'],
      },
    },
    plugins: {
      svelte,
      'svelte-state-snapshot': svelteStateSnapshot,
    },
    rules: {
      'svelte-state-snapshot/snapshot-required': 'error',
    },
  },
];
```

### Basic Configuration (JavaScript only)

```javascript
// eslint.config.js
import svelteStateSnapshot from 'eslint-plugin-svelte-state-snapshot-window';

export default [
  {
    plugins: {
      'svelte-state-snapshot': svelteStateSnapshot,
    },
    rules: {
      'svelte-state-snapshot/snapshot-required': 'error',
    },
  },
];
```

## Examples

### ❌ Incorrect

```typescript
const myState = $state({ count: 0 });
window.electronAPI.send(myState); // Error!

const provider = $state<ProviderInfo>();
window.loadImages({ provider }); // Error!
```

### ✅ Correct

```typescript
const myState = $state({ count: 0 });
window.electronAPI.send($state.snapshot(myState)); // OK

const provider = $state<ProviderInfo>();
window.loadImages({ provider: $state.snapshot(provider) }); // OK

const name = $state('John'); // Primitive types don't need snapshot
window.send(name); // OK
```

## How It Works

The rule only requires `$state.snapshot()` for **non-primitive types**.

**With TypeScript configured:**
- **Primitive types** (string, number, boolean, null, undefined, bigint, symbol) → No snapshot needed
- **Complex types** (objects, arrays, interfaces, classes, custom types) → Requires `$state.snapshot()`

```typescript
const name = $state('John');           // string → no snapshot needed
const count = $state(42);              // number → no snapshot needed
const enabled = $state(true);          // boolean → no snapshot needed

const user = $state({ name: 'John' }); // object → requires snapshot
const items = $state([1, 2, 3]);       // array → requires snapshot
const provider = $state<ProviderInfo>(); // interface → requires snapshot

// Property access is also checked:
const info = $state(createInfo());
window.send(info.name);     // OK if name is string
window.send(info.provider); // Error if provider is ProviderInfo
```

**Without TypeScript:**
- Requires `$state.snapshot()` for all `$state` objects (except literal primitives like `$state('string')`)
- Skips property access checking (assumes safe)

## License

Apache-2.0
