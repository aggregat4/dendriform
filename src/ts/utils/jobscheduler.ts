class JobScheduler {
  private scheduled = false
  private runningPromise: Promise<void> = null
  private timerHandle: number = null

  constructor(readonly timeout: number, readonly job: () => Promise<void>) {}

  async start(immediate: boolean): Promise<void> {
    if (this.scheduled) {
      return
    }
    this.scheduled = true
    if (immediate) {
      return this.runAndScheduleJob()
    } else {
      this.scheduleJob()
    }
  }

  private scheduleJob(): void {
    this.timerHandle = window.setTimeout(this.runAndScheduleJob.bind(this), this.timeout)
  }

  private async runAndScheduleJob(): Promise<void> {
    this.timerHandle = undefined
    this.runningPromise = this.job()
    await this.runningPromise
    this.runningPromise = null
    if (this.scheduled) {
      this.timerHandle = window.setTimeout(this.runAndScheduleJob.bind(this), this.timeout)
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
