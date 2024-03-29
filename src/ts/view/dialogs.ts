import { html, render } from 'lit-html'

class Position {
  constructor(readonly x: number, readonly y: number) {}
}

export interface DialogLifecycleAware {
  beforeShow(): void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isDialogLifecycleAware(obj: any): obj is DialogLifecycleAware {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return typeof obj.beforeShow === 'function'
}

type DialogCloseObserver = () => void

export class DialogElement extends HTMLElement {
  private _dialogCloseObserver: DialogCloseObserver = null

  private readonly dialogTemplate = () => html` <style>
      /* ---------- Dialog ---------- */
      /* Just the absolute basic styles for a responsive dialog */
      .dialog {
        background: white;
        line-height: 1;
        display: none;
        position: fixed;
        z-index: 2; /* dialogs need to be above the overlay */
        border: 1px #d1d1d1 solid;
        border-radius: 3px;
        animation: fadeIn 150ms ease-out;
        box-shadow: 0px 3px 6px rgba(0, 0, 0, 0.2);
        /* To center horizontally and vertically as per https://stackoverflow.com/a/25829529/1996 */
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        padding: 28px 4px 4px 4px;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .dialogOverlay {
        display: none;
        position: fixed;
        z-index: 1; /* overlay is above everything but the dialog itself */
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
      }

      .dialog .closeButton {
        position: absolute;
        top: 0;
        right: 0;
        padding: 4px 4px 0 0;
        color: #aaa;
        font-size: 1.5rem;
      }

      .closeButton::before {
        content: '✕';
      }

      .closeButton:hover {
        cursor: pointer;
      }

      .dialog header h1 {
        font-size: 2rem;
        font-weight: bold;
        margin-bottom: 12px;
      }

      /* Extra small devices (portrait phones, less than 576px) */
      @media (max-width: 575px) {
        .dialog {
          width: 100%;
          height: 100%;
          border: 0;
          padding: 40px 0px 20px 0px;
        }

        .dialog .closeButton {
          position: fixed;
          display: block;
        }
      }
    </style>
    <div class="dialog">
      <div class="closeButton" @click=${this.close.bind(this)}></div>
      <slot></slot>
    </div>
    <div class="dialogOverlay"></div>`

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  get dialogElement(): HTMLElement {
    return this.shadowRoot.querySelector('.dialog')
  }

  get overlayElement(): HTMLElement {
    return this.shadowRoot.querySelector('.dialogOverlay')
  }

  dismiss(): void {
    this.dialogCloseObserver = null
    this.dialogElement.style.display = 'none'
    this.overlayElement.style.display = 'none'
  }

  showAtPos(position: Position): void {
    this.beforeShow()
    const dialogElement = this.dialogElement
    if (this.getViewportWidth() < 576) {
      // this means we are fullscreen, no positioning necessary
      dialogElement.style.left = '0'
      dialogElement.style.top = '0'
    } else {
      dialogElement.style.left = `${position.x}px`
      dialogElement.style.top = `${position.y}px`
    }
    dialogElement.style.transform = 'none'
    dialogElement.style.display = 'block'
    if (this.getViewportWidth() >= 576 && !this.isInViewPort(dialogElement)) {
      // This moves the dialog up by the height of the dialog relative to the y position
      // where it should be shown: this means that instead of dropping down from the
      // position it will drop up. This is not entirely correct because some of the
      // elements of the dialog may render asynchronously and they will not be
      // accounted for in the clientHeight here. Close enough though.
      dialogElement.style.top = `${position.y - dialogElement.clientHeight}px`
    }
  }

  showCentered(): void {
    this.beforeShow()
    const dialogElement = this.dialogElement
    if (this.getViewportWidth() < 576) {
      // this means we are fullscreen, no positioning necessary
      dialogElement.style.left = '0'
      dialogElement.style.top = '0'
      dialogElement.style.transform = 'none'
    }
    dialogElement.style.display = 'block'
    this.overlayElement.style.display = 'block'
  }

  private getViewportWidth() {
    return Math.max(document.documentElement.clientWidth, window.innerWidth || 0)
  }

  private getViewportHeight() {
    return Math.max(document.documentElement.clientHeight, window.innerHeight || 0)
  }

  private isInViewPort(el: Element): boolean {
    const bounding = el.getBoundingClientRect()
    return (
      bounding.top >= 0 &&
      bounding.left >= 0 &&
      bounding.bottom <= this.getViewportHeight() &&
      bounding.right <= this.getViewportWidth()
    )
  }

  connectedCallback(): void {
    render(this.dialogTemplate(), this.shadowRoot)
  }

  getCloseButton(): HTMLElement {
    return this.shadowRoot.querySelector('.closeButton')
  }

  protected close(): void {
    if (this._dialogCloseObserver) {
      this._dialogCloseObserver()
    }
  }

  set dialogCloseObserver(dialogCloseObserver: DialogCloseObserver) {
    this._dialogCloseObserver = dialogCloseObserver
  }

  beforeShow(): void {
    // "assignedNodes" is a special property on a slot to get child elements
    this.shadowRoot
      .querySelector('slot')
      .assignedNodes()
      .forEach((dialogItem) => {
        if (isDialogLifecycleAware(dialogItem)) {
          dialogItem.beforeShow()
        }
      })
  }
}

customElements.define('df-dialog', DialogElement)

type DialogTrigger = string | HTMLElement

export class Dialog {
  constructor(readonly trigger: DialogTrigger, readonly dialogElement: DialogElement) {}
}

class ActiveDialog {
  constructor(readonly dialog: Dialog, readonly trigger: HTMLElement) {}
}

export class Dialogs {
  private dialogs: Dialog[] = []
  private activeDialog: ActiveDialog = null
  private readonly onDocumentClickedListener: (event: Event) => void

  constructor(root: HTMLElement) {
    root.addEventListener('click', this.onInRootClicked.bind(this))
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.onDocumentClickedListener = this.onDocumentClicked.bind(this)
  }

  registerDialog(dialog: Dialog): void {
    this.dialogs.push(dialog)
  }

  // always centered (for now)
  showTransientDialog(triggerElement: HTMLElement, dialogElement: DialogElement): void {
    if (this.isDialogActive()) {
      this.dismissDialog(this.getActiveDialog())
    }
    this.showDialogCentered(new Dialog(triggerElement, dialogElement), triggerElement)
  }

  private onInRootClicked(event: Event) {
    const clickedElement = event.target as HTMLElement
    for (const dialog of this.dialogs) {
      if (
        (dialog.trigger instanceof HTMLElement && dialog.trigger === clickedElement) ||
        (typeof dialog.trigger === 'string' && clickedElement.classList.contains(dialog.trigger))
      ) {
        if (this.isDialogActive()) {
          return
        } else {
          event.stopPropagation()
          this.showDialogRelative(dialog, clickedElement)
          return
        }
      }
    }
  }

  private isDialogActive(): boolean {
    return !!this.activeDialog
  }

  private getActiveDialog(): ActiveDialog {
    return this.activeDialog
  }

  private setActiveDialog(activeDialog: ActiveDialog): void {
    if (this.activeDialog) {
      throw new Error(`Setting an active dialog when one is already active`)
    }
    this.activeDialog = activeDialog

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.activeDialog.dialog.dialogElement.dialogCloseObserver =
      this.activeDialogCloseHandler.bind(this)
    // we register a global handler to track dismiss clicks outside of the dialog
    document.addEventListener('click', this.onDocumentClickedListener)
  }

  private onDocumentClicked(event: Event): void {
    const clickedElement = event.target as HTMLElement
    if (
      this.isDialogActive() &&
      this.activeDialog.trigger !== clickedElement &&
      (!this.getActiveDialog().dialog.dialogElement.contains(clickedElement) ||
        clickedElement === this.getActiveDialog().dialog.dialogElement.getCloseButton())
    ) {
      this.dismissDialog(this.getActiveDialog())
    }
  }

  private dismissDialog(dialog: ActiveDialog): void {
    document.removeEventListener('click', this.onDocumentClickedListener)
    dialog.dialog.dialogElement.dismiss()
    // Trigger is optional (for example with a centered dialog triggered by keyboard or something)
    dialog.trigger?.setAttribute('aria-expanded', 'false')
    this.activeDialog = null
  }

  private activeDialogCloseHandler(): void {
    this.dismissDialog(this.getActiveDialog())
  }

  private showDialogRelative(dialog: Dialog, triggerEl: HTMLElement): void {
    const left = triggerEl.getBoundingClientRect().left
    const top = triggerEl.getBoundingClientRect().top + triggerEl.getBoundingClientRect().height
    this.showDialogAtPos(dialog, new Position(left, top), triggerEl)
  }

  private showDialogAtPos(dialog: Dialog, position: Position, triggerEl?: HTMLElement): void {
    this.setActiveDialog(new ActiveDialog(dialog, triggerEl))
    triggerEl?.setAttribute('aria-expanded', 'true')
    dialog.dialogElement.showAtPos(position)
  }

  private showDialogCentered(dialog: Dialog, triggerEl?: HTMLElement): void {
    this.setActiveDialog(new ActiveDialog(dialog, triggerEl))
    triggerEl?.setAttribute('aria-expanded', 'true')
    dialog.dialogElement.showCentered()
  }
}
