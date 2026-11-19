import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';

/** How long the button says "Copied" after a copy. */
export const COPIED_MS = 2000;

/**
 * One text shown as code, with a Copy button that puts it on the clipboard and says "Copied" for
 * two seconds. Without a clipboard (an insecure origin, a denied permission) the press does
 * nothing: the text is on screen to select.
 */
@Component({
  selector: 'app-copy-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }
    code {
      flex: 1;
      min-width: 0;
      padding: 0.375rem 0.5rem;
      border-radius: 4px;
      background: var(--code-bg);
      font-size: 0.8125rem;
      white-space: pre-wrap;
      word-break: break-all;
    }
  `,
  template: `
    <code>{{ text() }}</code>
    <button type="button" (click)="write()">{{ buttonLabel() }}</button>
  `,
})
export class CopyText {
  private readonly document = inject(DOCUMENT);

  readonly text = input.required<string>();
  /** The button's label before a copy. */
  readonly label = input('Copy');

  protected readonly copied = signal(false);
  protected readonly buttonLabel = computed(() => (this.copied() ? 'Copied' : this.label()));
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  protected async write(): Promise<void> {
    const clipboard = this.document.defaultView?.navigator?.clipboard;
    if (!clipboard) return;
    try {
      await clipboard.writeText(this.text());
    } catch {
      return;
    }
    this.copied.set(true);
    this.clear();
    this.timer = setTimeout(() => this.copied.set(false), COPIED_MS);
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
