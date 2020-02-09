import { html, render } from 'lit-html'
import { ActivityIndicating } from '../domain/domain'

export class ActivityIndicator extends HTMLElement {
  private spinner: HTMLElement = null
  private timerId = null
  private readonly template = () => html`<div class="spinner"></div>`
  private _activityIndicating: ActivityIndicating = null

  constructor() {
    super()
  }

  connectedCallback() {
    render(this.template(), this)
    this.spinner = this.firstElementChild as HTMLElement
    if (! this.timerId) {
      this.timerId = setInterval(() => {
        this.updateActivityStatus()
      },
      this.delayMs)
    }
  }

  set activityIndicating(activityIndicating: ActivityIndicating) {
    this._activityIndicating = activityIndicating
  }

  get activityIndicating() {
    return this._activityIndicating
  }

  get delayMs(): number {
    const delayAttr = this.getAttribute('delayms')
    return delayAttr ? parseInt(delayAttr, 10) : 1000
  }

  get activityIndicatingId(): string {
    return this.getAttribute('refid')
  }

  // private findActivityIndicatingEl(): ActivityIndicating {
  //   let activityIndicatingEl = null
  //   const activityIndicatingId = this.activityIndicatingId
  //   if (activityIndicatingId) {
  //     activityIndicatingEl = document.getElementById(activityIndicatingId)
  //   } else {
  //     activityIndicatingEl = this.closest('.activityindicating')
  //   }
  //   return activityIndicatingEl as unknown as ActivityIndicating
  // }

  updateActivityStatus(): void {
    const activityIndicating = this.activityIndicating
    if (! activityIndicating) {
      return
    }
    const currentDisplay = this.spinner.style.display
    if (activityIndicating.isActive()) {
      if (currentDisplay !== 'block') {
        this.installPreventCloseWindowHandler()
        this.spinner.style.display = 'block'
      }
      this.spinner.title = activityIndicating.getActivityTitle() || 'Working...' // TODO: i18n
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
