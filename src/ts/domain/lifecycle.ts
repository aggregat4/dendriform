export interface LifecycleAware {
  init(): Promise<void>
  deinit(): Promise<void>
}

export function isLifecycleAware(object: any): object is LifecycleAware {
  return 'init' in object && 'deinit' in object
}

export interface ActivityIndicating {
  isActive(): boolean
  getActivityTitle(): string
}

export interface Subscription {
  cancel(): void
}
