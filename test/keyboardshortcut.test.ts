import { test } from '../lib/tizzy'
import expect from 'ceylon'

import {
  RawKbdShortcut,
  KbdKey,
  KbdModifier,
  KbdModifierType,
} from '../src/ts/view/keyboardshortcut'

test('Simple shortcuts without modifiers just consist of the key', () => {
  expect(new RawKbdShortcut(KbdKey.ArrowDown).toString()).toBe('ArrowDown')
})

test('Modifiers are prepended to the key', () => {
  expect(
    new RawKbdShortcut(KbdKey.Delete, [
      new KbdModifier(KbdModifierType.Alt, true),
      new KbdModifier(KbdModifierType.Ctrl, true),
    ]).toString()
  ).toBe('Alt+Ctrl+Delete')
})

test('Keyboard modifiers that should not be pressed are omitted from the string representation', () => {
  expect(
    new RawKbdShortcut(KbdKey.Tab, [
      new KbdModifier(KbdModifierType.Alt, false),
      new KbdModifier(KbdModifierType.Ctrl, true),
    ]).toString()
  ).toBe('Ctrl+Tab')
})
