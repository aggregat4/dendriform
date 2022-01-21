export interface LifecycleAware {
  init(): Promise<void>
  deinit(): Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isLifecycleAware(object: any): object is LifecycleAware {
  return 'init' in object && 'deinit' in object
}

export interface ActivityIndicating {
  isActive(): boolean
  getActivityTitle(): string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function register(object: any, initializables: LifecycleAware[]): any {
  if (isLifecycleAware(object)) {
    initializables.push(object)
  }
  return object
}

export async function initAll(initializables: LifecycleAware[]): Promise<void> {
  for (const initializable of initializables) {
    await initializable.init()
  }
}

export async function deinitAll(initializables: LifecycleAware[]): Promise<void> {
  while (initializables.length > 0) {
    await initializables.pop().deinit()
  }
}
