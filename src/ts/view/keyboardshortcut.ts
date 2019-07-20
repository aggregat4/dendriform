import { OperatingSystem, guessOperatingSystem } from '../utils/util'

export const enum KbdEventType { Input, Keydown, Keypress }
export enum SemanticShortcutType {
  Undo = 'Undo',
  Redo = 'Redo',
  BeginningOfDocument = 'BeginningOfDocument',
  EndOfDocument = 'EndOfDocument',
  Save = 'Save',
}
export enum KbdKey {
  Enter = 'Enter',
  ArrowUp = 'ArrowUp',
  ArrowDown = 'ArrowDown',
  Backspace = 'Backspace',
  Delete = 'Delete',
  Tab = 'Tab',
  Home = 'Home',
  End = 'End',
  s = 's',
  y = 'y',
  z = 'z',
}
export class KbdCode {
  constructor(readonly code: number) {}
}
export enum KbdModifierType {
  Shift = 'Shift',
  Ctrl = 'Ctrl',
  Command = 'Command',
  Alt = 'Alt',
}

export interface TreeNodeSelector {
  matches(node: Element): boolean
}

export class NodeClassSelector implements TreeNodeSelector {
  constructor(readonly cssClass: string) {}
  matches(node: Element): boolean {
    return node.classList.contains(this.cssClass)
  }
}

export class AllNodesSelector implements TreeNodeSelector {
  matches(node: Element): boolean {
    return true
  }
}

export class SemanticShortcut {
  constructor(readonly type: SemanticShortcutType) {}
}

export class KbdModifier {
  constructor(readonly type: KbdModifierType, readonly pressed: boolean) {}
}
export class RawKbdShortcut {
  constructor(readonly key: KbdKey | KbdCode, readonly modifiers: KbdModifier[] = []) {}

  toString(): string {
    const modifiers = this.modifiers.filter(m => m.pressed).map(m => m.type.toString()).join('+')
    if (modifiers) {
      return `${modifiers}+${this.key.toString()}`
    } else {
      return this.key.toString()
    }
  }
}

/**
 * Each semantic shortcut is mapped to a list of real shortcut triggers. This is a list because
 * we want to provide some leniency for user. For example mapping Home on mac OS to both the native
 * chord as well as the more pc friendly combination.
 */
const shortcutMappings: Map<OperatingSystem, Map<SemanticShortcutType, RawKbdShortcut[]>> = new Map()

const macOsMap: Map<SemanticShortcutType, RawKbdShortcut[]> = new Map()
macOsMap.set(
  SemanticShortcutType.Undo,
  // Command+z
  [new RawKbdShortcut(new KbdCode(90), [
    new KbdModifier(KbdModifierType.Command, true),
    new KbdModifier(KbdModifierType.Shift, false)])])
macOsMap.set(
  SemanticShortcutType.Redo,
  // Command+Shift+z
  [new RawKbdShortcut(new KbdCode(90), [
    new KbdModifier(KbdModifierType.Command, true),
    new KbdModifier(KbdModifierType.Shift, true)])])
macOsMap.set(
  SemanticShortcutType.BeginningOfDocument,
  // Home
  [new RawKbdShortcut(KbdKey.Home)])
macOsMap.set(
  SemanticShortcutType.EndOfDocument,
  // End
  [new RawKbdShortcut(KbdKey.End)])
macOsMap.set(
  SemanticShortcutType.Save,
  // Command+s
  [new RawKbdShortcut(KbdKey.s, [
    new KbdModifier(KbdModifierType.Command, true)])])
shortcutMappings.set(OperatingSystem.MacOs, macOsMap)

const windowsMap: Map<SemanticShortcutType, RawKbdShortcut[]> = new Map()
windowsMap.set(
  SemanticShortcutType.Undo,
  // Ctrl+z
  [new RawKbdShortcut(new KbdCode(90), [
    new KbdModifier(KbdModifierType.Ctrl, true),
    new KbdModifier(KbdModifierType.Shift, false)])])
windowsMap.set(
  SemanticShortcutType.Redo,
  [
    // Shift+Ctrl+z
    new RawKbdShortcut(new KbdCode(90), [
      new KbdModifier(KbdModifierType.Ctrl, true),
      new KbdModifier(KbdModifierType.Shift, true)]),
    // Ctrl+y
    new RawKbdShortcut(KbdKey.y, [
      new KbdModifier(KbdModifierType.Ctrl, true)]),
  ])
windowsMap.set(
  SemanticShortcutType.BeginningOfDocument,
  // Ctrl+Home
  [new RawKbdShortcut(KbdKey.Home, [new KbdModifier(KbdModifierType.Ctrl, true)])])
windowsMap.set(
  SemanticShortcutType.EndOfDocument,
  // Ctrl+End
  [new RawKbdShortcut(KbdKey.End, [new KbdModifier(KbdModifierType.Ctrl, true)])])
windowsMap.set(
  SemanticShortcutType.Save,
  // Ctrl+s
  [new RawKbdShortcut(KbdKey.s, [
    new KbdModifier(KbdModifierType.Ctrl, true)])])
shortcutMappings.set(OperatingSystem.Windows, windowsMap)
shortcutMappings.set(OperatingSystem.Linux, windowsMap)

export function toRawShortCuts(semanticShortcut: SemanticShortcut): RawKbdShortcut[] {
  const os = guessOperatingSystem()
  const shortcutMap = shortcutMappings.get(os) || windowsMap
  return shortcutMap.get(semanticShortcut.type)
}

export class KeyboardEventTrigger {
  constructor(
    // more than one needed?
    readonly eventType: KbdEventType,
    // simplified selector like ".class" or "#id"
    readonly targetFilter: TreeNodeSelector,
    // a list of keyboardshortcuts that trigger this, evaluated as an OR
    readonly shortcuts: RawKbdShortcut[] = []) {}

  toString(): string {
    return this.shortcuts.map(s => s.toString()).join(', ')
  }

  isTriggered(type: KbdEventType, event: Event): boolean {
    if (type !== this.eventType) {
      return false
    }
    if (this.targetFilter && !this.targetFilter.matches(event.target as Element)) {
      return false
    }
    switch (type) {
      case KbdEventType.Keydown:
      case KbdEventType.Keypress:
        const kbdEvent = event as KeyboardEvent
        for (const shortcut of this.shortcuts) {
          if (this.doesKeyMatch(shortcut.key, kbdEvent) && this.doModifiersMatch(shortcut.modifiers, kbdEvent)) {
            return true
          }
        }
        return false
      case KbdEventType.Input:
        return true // if something listens on input it always triggers
      default:
        console.log(`Unexpected event type ${type} which is not handled by our shortcut system!`)
        return false
    }
  }

  private doesKeyMatch(key: KbdKey | KbdCode, event: KeyboardEvent): boolean {
    if (key instanceof KbdCode) {
      return key.code === event.keyCode
    } else {
      return key === event.key
    }
  }

  private doModifiersMatch(modifiers: KbdModifier[], event: KeyboardEvent): boolean {
    for (const modifier of modifiers) {
      const modifierPresent = this.isModifierPresent(modifier, event)
      if ((modifier.pressed && !modifierPresent) || (!modifier.pressed && modifierPresent)) {
        return false
      }
    }
    return true
  }

  private isModifierPresent(modifier: KbdModifier, event: KeyboardEvent): boolean {
    switch (modifier.type) {
      case KbdModifierType.Alt: return !!event.altKey
      // this is tricky, according to https://stackoverflow.com/a/5500536/1996 this may or may not work in chrome
      case KbdModifierType.Command: return !!event.metaKey
      case KbdModifierType.Ctrl: return !!event.ctrlKey
      case KbdModifierType.Shift: return !!event.shiftKey
      default: throw Error(`Unexpected keyboard modifier type ${modifier.type} in a keyboard trigger`)
    }
  }

}
