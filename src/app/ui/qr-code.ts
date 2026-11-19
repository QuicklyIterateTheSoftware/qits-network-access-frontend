import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/** The quiet zone around the code, in modules: the four the QR standard asks for. */
const QUIET = 4;

/** One QR code: its width in modules, quiet zone included, and the dark modules as one path. */
interface QrDrawing {
  readonly size: number;
  readonly path: string;
}

/**
 * `text` as a QR code, drawn here as inline SVG (qits-2262: a WireGuard app scans a device's config
 * off the Network access page). The code is made in the page by `qrcode-generator`, a dependency
 * with no network of its own, so the text never leaves the browser; error correction M, the
 * smallest version that holds it, in byte mode.
 *
 * ```html
 * <app-qr-code [text]="config" label="The device's WireGuard config" />
 * ```
 *
 * A scanner wants dark modules on a light ground, so the code is drawn black on white in every
 * colour scheme. A text too long for the largest version draws nothing.
 */
@Component({
  selector: 'app-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      background: #fff;
      fill: #000;
    }
  `,
  template: `
    @if (drawing(); as qr) {
      <svg
        role="img"
        [attr.aria-label]="label()"
        [attr.viewBox]="'0 0 ' + qr.size + ' ' + qr.size"
        shape-rendering="crispEdges"
      >
        <path [attr.d]="qr.path" />
      </svg>
    }
  `,
})
export class QrCode {
  /** What the code holds. */
  readonly text = input.required<string>();
  /** The image's accessible name. */
  readonly label = input('QR code');

  protected readonly drawing = computed((): QrDrawing | undefined => qrDrawing(this.text()));
}

/** `text`'s QR code as an SVG path, one unit square per dark module; undefined when it cannot. */
export function qrDrawing(text: string): QrDrawing | undefined {
  const qr = qrcode(0, 'M');
  try {
    qr.addData(text, 'Byte');
    qr.make();
  } catch {
    return undefined;
  }
  const count = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }
  return { size: count + 2 * QUIET, path };
}
