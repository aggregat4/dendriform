import { html, render } from 'lit-html'
import { ActivityIndicating } from '../domain/lifecycle'

export class ActivityIndicator extends HTMLElement {
  #spinner: HTMLElement = null
  #timerId = null
  #_activityIndicating: ActivityIndicating = null
  #template = () => html` <style>
      .spinner {
        display: none;
      }

      .spinner,
      .spinner:after {
        border-radius: 50%;
        width: 1em;
        height: 1em;
      }

      .spinner {
        font-size: 10px;
        position: relative;
        text-indent: -9999em;
        border-top: 0.5em solid rgba(0, 0, 0, 0.2);
        border-right: 0.5em solid rgba(0, 0, 0, 0.2);
        border-bottom: 0.5em solid rgba(0, 0, 0, 0.2);
        border-left: 0.5em solid #ffffff;
        transform: translateZ(0);
        animation: load8 1.1s infinite linear;
      }

      @-webkit-keyframes load8 {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      @keyframes load8 {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
    </style>
    <div class="spinner"></div>`

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback(): void {
    render(this.#template(), this.shadowRoot)
    if (!this.#timerId) {
      this.#timerId = setInterval(() => {
        this.updateActivityStatus()
      }, this.delayMs)
    }
  }

  set activityIndicating(activityIndicating: ActivityIndicating) {
    this.#_activityIndicating = activityIndicating
  }

  get activityIndicating(): ActivityIndicating {
    return this.#_activityIndicating
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
    if (!activityIndicating) {
      return
    }
    if (!this.#spinner) {
      const spinner = this.shadowRoot.querySelector('.spinner') as HTMLElement
      if (spinner) {
        this.#spinner = spinner
      } else {
        return
      }
    }
    const currentDisplay = this.#spinner.style.display
    if (activityIndicating.isActive()) {
      if (currentDisplay !== 'block') {
        this.installPreventCloseWindowHandler()
        this.#spinner.style.display = 'block'
      }
      this.#spinner.title = activityIndicating.getActivityTitle() || 'Working...' // TODO: i18n
    } else {
      if (currentDisplay !== 'none') {
        this.uninstallPreventCloseWindowHandler()
        this.#spinner.style.display = 'none'
        this.#spinner.title = 'Idle' // TODO: i18n
      }
    }
  }

  private installPreventCloseWindowHandler() {
    if (!window.onbeforeunload) {
      window.onbeforeunload = (e: BeforeUnloadEvent) => {
        const message =
          'Events are being saved, if you close the window you may lose data. Proceed?'
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

  disconnectedCallback(): void {
    if (this.#timerId) {
      clearInterval(this.#timerId)
      this.#timerId = null
    }
  }
}

customElements.define('df-spinner', ActivityIndicator)
