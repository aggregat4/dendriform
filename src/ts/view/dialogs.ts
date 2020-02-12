import { html, render } from 'lit-html'

export class Position {
  constructor(readonly x: number, readonly y: number) {}
}

export type DialogCloseObserver = () => void

export abstract class DialogElement extends HTMLElement {
  private closeButton: HTMLElement
  private dialogCloseObserver: DialogCloseObserver = null

  private readonly dialogTemplate = () => html`
    <div class="closeButton"></div>
    <div class="dialogContents"></div>`

  constructor() {
    super()
  }

  connectedCallback() {
    this.setAttribute('class', 'dialog')
    const children = Array.from(this.querySelectorAll('*'))
    render(this.dialogTemplate(), this)
    const container = this.getContainer()
    for (const child of children) {
      container.appendChild(child)
    }
    this.initDialogContents()
  }

  protected getContainer(): HTMLElement {
    return this.querySelector('.dialogContents') as HTMLElement
  }

  protected abstract initDialogContents()

  getCloseButton(): HTMLElement {
    return this.closeButton
  }

  destroy(): void {
    // NOOP
  }

  protected close(): void {
    this.dialogCloseObserver()
  }

  setDialogCloseObserver(dialogCloseObserver: DialogCloseObserver): void {
    this.dialogCloseObserver = dialogCloseObserver
  }

  beforeShow(): void {
    // NOOP
  }
}

export type DialogTrigger = string | HTMLElement

export class Dialog {
  constructor(
    readonly trigger: DialogTrigger,
    readonly dialogElement: DialogElement) {}
}

class ActiveDialog {
  constructor(readonly dialog: Dialog, readonly trigger: HTMLElement) {}
}

export class Dialogs {
  private dialogs: Dialog[] = []
  private activeDialog: ActiveDialog = null
  private overlay: HTMLElement = null

  constructor(root: HTMLElement, overlay: HTMLElement) {
    root.addEventListener('click', this.onInRootClicked.bind(this))
    document.addEventListener('click', this.onDocumentClicked.bind(this))
    this.overlay = overlay
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
      if ( (dialog.trigger instanceof HTMLElement && dialog.trigger === clickedElement) ||
           (typeof dialog.trigger === 'string' && clickedElement.classList.contains(dialog.trigger))) {
        if (this.isDialogActive()) {
          return
        } else {
          this.showDialogRelative(dialog, clickedElement)
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
    this.activeDialog.dialog.dialogElement.setDialogCloseObserver(this.activeDialogCloseHandler.bind(this))
  }

  private onDocumentClicked(event: Event) {
    const clickedElement = event.target as HTMLElement
    if (this.isDialogActive() &&
        this.activeDialog.trigger !== clickedElement &&
        (!this.getActiveDialog().dialog.dialogElement.contains(clickedElement) ||
         clickedElement === this.getActiveDialog().dialog.dialogElement.getCloseButton())) {
      this.dismissDialog(this.getActiveDialog())
    }
  }

  private dismissDialog(dialog: ActiveDialog): void {
    dialog.dialog.dialogElement.destroy()
    dialog.dialog.dialogElement.setDialogCloseObserver(null)
    dialog.trigger.setAttribute('aria-expanded', 'false')
    dialog.dialog.dialogElement.style.display = 'none'
    this.activeDialog = null
    this.overlay.style.display = 'none'
  }

  private showDialogRelative(dialog: Dialog, triggerEl: HTMLElement): void {
    const left = triggerEl.getBoundingClientRect().left
    const top = triggerEl.getBoundingClientRect().top + triggerEl.getBoundingClientRect().height
    this.showDialogAtPos(dialog, triggerEl, new Position(left, top))
  }

  private showDialogAtPos(dialog: Dialog, triggerEl: HTMLElement, position: Position): void {
    this.setActiveDialog(new ActiveDialog(dialog, triggerEl))
    triggerEl.setAttribute('aria-expanded', 'true')
    if (this.getViewportWidth() < 576) {
      // this means we are fullscreen, no positioning necessary
      dialog.dialogElement.style.left = '0'
      dialog.dialogElement.style.top = '0'
    } else {
      dialog.dialogElement.style.left = position.x + 'px'
      dialog.dialogElement.style.top = position.y + 'px'
    }
    dialog.dialogElement.beforeShow()
    dialog.dialogElement.style.transform = 'none'
    dialog.dialogElement.style.display = 'block'
  }

  private activeDialogCloseHandler(): void {
    this.dismissDialog(this.getActiveDialog())
  }

  private showDialogCentered(dialog: Dialog, triggerEl: HTMLElement): void {
    this.setActiveDialog(new ActiveDialog(dialog, triggerEl))
    triggerEl.setAttribute('aria-expanded', 'true')
    if (this.getViewportWidth() < 576) {
      // this means we are fullscreen, no positioning necessary
      dialog.dialogElement.style.left = '0'
      dialog.dialogElement.style.top = '0'
      dialog.dialogElement.style.transform = 'none'
    }
    dialog.dialogElement.beforeShow()
    dialog.dialogElement.style.display = 'block'
    this.overlay.style.display = 'block'
  }

  private getViewportWidth() {
    return Math.max(document.documentElement.clientWidth, window.innerWidth || 0)
  }

  private getViewportHeight() {
    return Math.max(document.documentElement.clientHeight, window.innerHeight || 0)
  }
}
