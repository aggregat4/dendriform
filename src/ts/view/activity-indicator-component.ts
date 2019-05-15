import h from 'hyperscript'
import { ActivityIndicating } from '../domain/domain'

export class ActivityIndicator extends HTMLElement {
  private spinner: HTMLElement = null
  private timerId = null

  constructor(readonly activityIndicating: ActivityIndicating, readonly delayMs: number = 1000) {
    super()
  }

  connectedCallback() {
    if (!this.spinner) {
      this.spinner = h('div.spinner')
      this.append(this.spinner)
    }
    if (! this.timerId) {
      this.timerId = setInterval(() => {
        this.updateActivityStatus()
      },
      this.delayMs)
    }
  }

  updateActivityStatus(): void {
    const currentDisplay = this.spinner.style.display
    if (this.activityIndicating.isActive()) {
      if (currentDisplay !== 'block') {
        this.installPreventCloseWindowHandler()
        this.spinner.style.display = 'block'
      }
      this.spinner.title = this.activityIndicating.getActivityTitle() || 'Working...' // TODO: i18n
    } else {
      if (currentDisplay !== 'none') {
        this.uninstallPreventCloseWindowHandler()
        this.spinner.style.display = 'none'
        this.spinner.title = 'Idle' // TODO: i18n
      }
    }
  }

  private installPreventCloseWindowHandler() {
    if (!window.onbeforeunload) {
      window.onbeforeunload = (e) => {
        const message = 'Events are being saved, if you close the window you may lose data. Proceed?'
        const event = e || window.event
        // For IE and Firefox
        if (event) {
          event.returnValue = message
        }
        // For Safari
        return message
      }
    }
  }

  private uninstallPreventCloseWindowHandler() {
    window.onbeforeunload = null
  }

  disconnectedCallback() {
    if (this.timerId) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

}

customElements.define('a4-spinner', ActivityIndicator)
