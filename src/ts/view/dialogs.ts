export abstract class DialogElement extends HTMLElement {
  constructor() {
    super()
  }

  abstract getCloseButton(): HTMLElement
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

  constructor(root: HTMLElement) {
    root.addEventListener('click', this.onInRootClicked.bind(this))
    document.addEventListener('click', this.onDocumentClicked.bind(this))
  }

  registerDialog(dialog: Dialog): void {
    this.dialogs.push(dialog)
  }

  private onInRootClicked(event: Event) {
    const clickedElement = event.target as HTMLElement
    for (const dialog of this.dialogs) {
      if ( (dialog.trigger instanceof HTMLElement && dialog.trigger === clickedElement) ||
           (typeof dialog.trigger === 'string' && clickedElement.classList.contains(dialog.trigger))) {
        if (this.isDialogActive()) {
          return
        } else {
          this.showDialog(dialog, clickedElement)
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
    dialog.trigger.setAttribute('aria-expanded', 'false')
    dialog.dialog.dialogElement.style.display = 'none'
    this.activeDialog = null
  }

  private showDialog(dialog: Dialog, triggerEl: HTMLElement): void {
    this.setActiveDialog(new ActiveDialog(dialog, triggerEl))
    triggerEl.setAttribute('aria-expanded', 'true')
    // TODO: clever dialog positioning, we're going to display it in fixed position
    if (this.getViewportWidth() < 576) {
      // this means we are fullscreen, no positioning necessary
      dialog.dialogElement.style.left = '0'
      dialog.dialogElement.style.top = '0'
    } else {
      const left = triggerEl.getBoundingClientRect().left
      const top = triggerEl.getBoundingClientRect().top + triggerEl.getBoundingClientRect().height
      dialog.dialogElement.style.left = left + 'px'
      dialog.dialogElement.style.top = top + 'px'
    }
    dialog.dialogElement.style.display = 'block'
  }

  private getViewportWidth() {
    return Math.max(document.documentElement.clientWidth, window.innerWidth || 0)
  }
}
