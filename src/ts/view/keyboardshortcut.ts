import { OperatingSystem, guessOperatingSystem } from '../util'

export enum KbdEventType { Input, Keydown, Keypress }
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
export enum KbdModifierType {
  Shift,
  Ctrl,
  Command,
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

export class NodeIdSelector implements TreeNodeSelector {
  constructor(readonly id: string) {}
  matches(node: Element): boolean {
    return node.getAttribute('id') === this.id
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
  constructor(readonly key: KbdKey, readonly modifiers: KbdModifier[] = []) {}
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
  [new RawKbdShortcut(KbdKey.z, [
    new KbdModifier(KbdModifierType.Command, true)])])
macOsMap.set(
  SemanticShortcutType.Redo,
  // Command+Shift+z
  [new RawKbdShortcut(KbdKey.z, [
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
  [new RawKbdShortcut(KbdKey.z, [
    new KbdModifier(KbdModifierType.Ctrl, true)])])
windowsMap.set(
  SemanticShortcutType.Redo,
  [
    // Shift+Ctrl+z
    new RawKbdShortcut(KbdKey.z, [
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
    // a list of keyboardshortcuts that trigger this, this is evaluated as an OR
    readonly shortcuts: RawKbdShortcut[]) {}

  isTriggered(eventType: KbdEventType, event: Event): boolean {
    // TODO: implement
    return false
  }
}
