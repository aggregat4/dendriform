export enum KeyboardEventType {
  input, keydown, keypress, click,
}

export class NodeClassSelector {
  constructor(readonly cssClass: string) {}
}
export class NodeIdSelector {
  constructor(readonly id: string) {}
}
export class AllNodesSelector { }
export type NodeSelector = NodeClassSelector | NodeIdSelector | AllNodesSelector

export enum SemanticShortcutType {
  Undo, Redo, BeginningOfDocument, EndOfDocument, Save,
}
export class SemanticShortcut {
  constructor(readonly type: SemanticShortcutType) {}
}

export enum KeyboardKey {
  Enter, ArrowUp, ArrowDown, Backspace, Delete, Tab,
}
export enum KeyboardModifierType {
  Shift, Ctrl,
}
export class KeyboardModifier {
  constructor(readonly type: KeyboardModifierType, readonly pressed: boolean) {}
}
export interface RawShortcut {
  key(): KeyboardKey
  modifiers(): KeyboardModifier[]
}

export type KeyboardShortCut = SemanticShortcut | RawShortcut

export interface KeyboardShortcut {
  // more than one needed?
  eventType(): KeyboardEventType
  // simplified selector like ".class" or "#id"
  targetFilter(): NodeSelector
  // a list of keyboardshortcuts that trigger this, this is evaluated as an OR
  shortcuts(): KeyboardShortCut[]
}
