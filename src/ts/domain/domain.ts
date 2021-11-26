export const enum RelativeLinearPosition {
  BEFORE,
  AFTER,
  BEGINNING,
  END,
}

export interface RelativeNodePosition {
  nodeId?: string
  beforeOrAfter: RelativeLinearPosition
}

export const RELATIVE_NODE_POSITION_END = { beforeOrAfter: RelativeLinearPosition.END }

export interface Subscription {
  cancel(): void
}
