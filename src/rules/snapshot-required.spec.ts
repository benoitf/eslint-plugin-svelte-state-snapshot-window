import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import snapshotRequired from './snapshot-required.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('snapshot-required', () => {
  it('should validate $state.snapshot usage in window.* calls', () => {
    ruleTester.run('snapshot-required', snapshotRequired, {
      valid: [
        {
          name: 'Should allow window.* call with $state.snapshot',
          code: `
        const myState = $state({ count: 0 });
        window.electronAPI.send($state.snapshot(myState));
      `,
        },
        {
          name: 'Should allow window.* call with non-$state variable',
          code: `
        const regularVar = { count: 0 };
        window.electronAPI.send(regularVar);
      `,
        },
        {
          name: 'Should allow window.* call with literal',
          code: `
        window.electronAPI.send("hello");
      `,
        },
        {
          name: 'Should allow window.* call with no arguments',
          code: `
        window.electronAPI.send();
      `,
        },
        {
          name: 'Should allow non-window calls with $state',
          code: `
        const myState = $state({ count: 0 });
        console.log(myState);
      `,
        },
        {
          name: 'Should allow $state in other contexts',
          code: `
        const myState = $state({ count: 0 });
        const value = myState.count;
      `,
        },
        {
          name: 'Should allow property access of $state object with primitive value',
          code: `
        const buildImageInfo = $state({ containerBuildPlatform: 'linux' });
        window.buildImage(buildImageInfo.containerBuildPlatform);
      `,
        },
        {
          name: 'Should allow property access from $state initialized with function',
          code: `
        const buildImageInfo = $state(createDefaultBuildImageInfo());
        window.buildImage(buildImageInfo.containerImageName);
      `,
        },
        {
          name: 'Should allow any property access from $state objects',
          code: `
        const buildImageInfo = $state(createDefaultBuildImageInfo());
        window.buildImage(buildImageInfo.selectedProvider);
      `,
        },
        {
          name: 'Should allow nested property access of $state object without snapshot',
          code: `
        const state = $state({ user: { name: 'John' } });
        window.api.send(state.user.name);
      `,
        },
        {
          name: 'Should allow primitive $state (string) without snapshot',
          code: `
        const myString = $state('hello');
        window.electronAPI.send(myString);
      `,
        },
        {
          name: 'Should allow primitive $state (number) without snapshot',
          code: `
        const myNumber = $state(42);
        window.electronAPI.send(myNumber);
      `,
        },
        {
          name: 'Should allow primitive $state (boolean) without snapshot',
          code: `
        const myBool = $state(true);
        window.electronAPI.send(myBool);
      `,
        },
        {
          name: 'Should allow $state with ternary expression returning primitives',
          code: `
        const existingIssuesLink = $state(
          category === 'bug'
            ? 'https://github.com/issues?q=bug'
            : 'https://github.com/issues?q=feature',
        );
        window.openExternal(existingIssuesLink);
      `,
        },
        {
          name: 'Should allow $state initialized with undefined',
          code: `
        const myValue = $state(undefined);
        window.send(myValue);
      `,
        },
        {
          name: 'Should allow $state with ternary returning undefined or primitive',
          code: `
        const optionalValue = $state(hasValue ? 'something' : undefined);
        window.send(optionalValue);
      `,
        },
        {
          name: 'Should allow $state variable wrapped in object literal if using snapshot',
          code: `
        const selectedProvider = $state({ name: 'docker' });
        window.loadImages({ provider: $state.snapshot(selectedProvider) });
      `,
        },
        {
          name: 'Should allow $state with undefined if wrapped with snapshot',
          code: `
        const maybeValue = $state();
        window.send($state.snapshot(maybeValue));
      `,
        },
      ],

      invalid: [
        {
          name: 'Should error when passing $state variable to window.* without snapshot',
          code: `
        const myState = $state({ count: 0 });
        window.electronAPI.send(myState);
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'myState' },
            },
          ],
          output: `
        const myState = $state({ count: 0 });
        window.electronAPI.send($state.snapshot(myState));
      `,
        },
        {
          name: 'Should error for multiple $state arguments',
          code: `
        const state1 = $state({ a: 1 });
        const state2 = $state({ b: 2 });
        window.ipc.invoke(state1, state2);
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'state1' },
            },
            {
              messageId: 'requireSnapshot',
              data: { name: 'state2' },
            },
          ],
          output: `
        const state1 = $state({ a: 1 });
        const state2 = $state({ b: 2 });
        window.ipc.invoke($state.snapshot(state1), $state.snapshot(state2));
      `,
        },
        {
          name: 'Should error for different window.* methods',
          code: `
        const myState = $state({ count: 0 });
        window.postMessage(myState);
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'myState' },
            },
          ],
          output: `
        const myState = $state({ count: 0 });
        window.postMessage($state.snapshot(myState));
      `,
        },
        {
          name: 'Should error for $state with mixed arguments',
          code: `
        const myState = $state({ count: 0 });
        const regular = { x: 1 };
        window.api.send("channel", myState, regular);
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'myState' },
            },
          ],
          output: `
        const myState = $state({ count: 0 });
        const regular = { x: 1 };
        window.api.send("channel", $state.snapshot(myState), regular);
      `,
        },
        {
          name: 'Should error for complex property from object literal',
          code: `
        const state = $state({ user: { name: 'John' } });
        window.api.send(state.user);
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'state.user' },
            },
          ],
          output: `
        const state = $state({ user: { name: 'John' } });
        window.api.send($state.snapshot(state.user));
      `,
        },
        {
          name: 'Should error when $state variable is used inside object literal',
          code: `
        const selectedProvider = $state({ name: 'docker' });
        window.loadImages({ provider: selectedProvider, archives: [] });
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'selectedProvider' },
            },
          ],
          output: `
        const selectedProvider = $state({ name: 'docker' });
        window.loadImages({ provider: $state.snapshot(selectedProvider), archives: [] });
      `,
        },
        {
          name: 'Should error when $state variable is used inside array literal',
          code: `
        const archive = $state({ path: '/tmp/file.tar' });
        window.loadImages({ archives: [archive] });
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'archive' },
            },
          ],
          output: `
        const archive = $state({ path: '/tmp/file.tar' });
        window.loadImages({ archives: [$state.snapshot(archive)] });
      `,
        },
        {
          name: 'Should error for nested $state variables in complex structure',
          code: `
        const provider = $state({ name: 'docker' });
        const archive = $state({ path: '/tmp/file.tar' });
        window.loadImages({ provider: provider, archives: [archive] });
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'provider' },
            },
            {
              messageId: 'requireSnapshot',
              data: { name: 'archive' },
            },
          ],
          output: `
        const provider = $state({ name: 'docker' });
        const archive = $state({ path: '/tmp/file.tar' });
        window.loadImages({ provider: $state.snapshot(provider), archives: [$state.snapshot(archive)] });
      `,
        },
        {
          name: 'Should error for $state with no arguments (undefined)',
          code: `
        const selectedProvider = $state();
        window.loadImages({ provider: selectedProvider });
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'selectedProvider' },
            },
          ],
          output: `
        const selectedProvider = $state();
        window.loadImages({ provider: $state.snapshot(selectedProvider) });
      `,
        },
        {
          name: 'Should error for $state initialized with undefined literal',
          code: `
        const maybeValue = $state(undefined);
        window.send(maybeValue);
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'maybeValue' },
            },
          ],
          output: `
        const maybeValue = $state(undefined);
        window.send($state.snapshot(maybeValue));
      `,
        },
        {
          name: 'Should error for $state initialized with variable',
          code: `
        const initialValue = getInitialValue();
        const myState = $state(initialValue);
        window.send(myState);
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'myState' },
            },
          ],
          output: `
        const initialValue = getInitialValue();
        const myState = $state(initialValue);
        window.send($state.snapshot(myState));
      `,
        },
        {
          name: 'Should error for $state with no arguments (without TypeScript type info)',
          code: `
        const selectedProvider = $state();
        window.loadImages({ provider: selectedProvider });
      `,
          errors: [
            {
              messageId: 'requireSnapshot',
              data: { name: 'selectedProvider' },
            },
          ],
          output: `
        const selectedProvider = $state();
        window.loadImages({ provider: $state.snapshot(selectedProvider) });
      `,
        },
      ],
    });
  });
});
