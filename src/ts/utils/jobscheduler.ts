export interface TimeoutStrategy {
  calcNewTimeout(success: boolean): number
}

export class FixedTimeoutStrategy implements TimeoutStrategy {
  constructor(readonly timeout: number) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  calcNewTimeout(success: boolean): number {
    return this.timeout
  }
}

export class BackoffWithJitterTimeoutStrategy implements TimeoutStrategy {
  private previousTimeout: number

  constructor(readonly timeout: number, readonly maxTimeout: number) {
    this.previousTimeout = this.timeout
  }

  calcNewTimeout(success: boolean): number {
    if (success) {
      this.previousTimeout = this.timeout
    } else {
      if (this.previousTimeout < this.maxTimeout) {
        this.previousTimeout = this.calcBackoffTimeout(this.previousTimeout)
      } else {
        this.previousTimeout = this.maxTimeout
      }
    }
    return this.previousTimeout
  }

  private calcBackoffTimeout(currentTimeoutMs: number): number {
    return (currentTimeoutMs * 2) + (1000 * Math.random())
  }
}

export class JobScheduler {
  private scheduled = false
  private runningPromise: Promise<void> = null
  private timerHandle: number = null

  constructor(readonly timeoutStrategy: TimeoutStrategy, readonly job: () => Promise<void>) {}

  async start(immediate: boolean): Promise<void> {
    if (this.scheduled) {
      return
    }
    this.scheduled = true
    if (immediate) {
      return this.runAndScheduleJob()
    } else {
      return this.scheduleJob(this.timeoutStrategy.calcNewTimeout(true))
    }
  }

  private scheduleJob(timeout: number): void {
    this.timerHandle = window.setTimeout(() => void this.runAndScheduleJob(), timeout)
  }

  private async runAndScheduleJob(): Promise<void> {
    this.timerHandle = undefined
    let newTimeout = null
    try {
      this.runningPromise = this.job()
      await this.runningPromise
      newTimeout = this.timeoutStrategy.calcNewTimeout(true)
    } catch (e) {
      newTimeout = this.timeoutStrategy.calcNewTimeout(false)
    }
    this.runningPromise = null
    // make sure we check whether we are still scheduled, otherwise abort
    if (this.scheduled) {
      this.scheduleJob(newTimeout)
    }
  }

  stop(): void {
    if (!this.scheduled) {
      return
    }
    this.scheduled = false
    if (this.timerHandle) {
      window.clearTimeout(this.timerHandle)
    }
    this.timerHandle = null
  }

  isScheduled(): boolean {
    return this.scheduled
  }

  isRunning(): boolean {
    return this.runningPromise !== null
  }

  async stopAndWaitUntilDone(): Promise<void> {
    this.stop()
    if (this.isRunning()) {
      await this.runningPromise
    }
  }
}
