export const enum RelativeLinearPosition {
  BEFORE,
  AFTER,
  BEGINNING,
  END,
  UNCHANGED,
}

export interface RelativeNodePosition {
  nodeId?: string
  beforeOrAfter: RelativeLinearPosition
}

export const RELATIVE_NODE_POSITION_END = { beforeOrAfter: RelativeLinearPosition.END }
export const RELATIVE_NODE_POSITION_UNCHANGED = { beforeOrAfter: RelativeLinearPosition.UNCHANGED }

export interface Subscription {
  cancel(): void
}
