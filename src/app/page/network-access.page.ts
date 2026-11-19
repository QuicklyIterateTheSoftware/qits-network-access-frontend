import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { QitsApiError, qitsMutation, qitsResource, type QitsResourceRef } from '@qits/angular';
import {
  addDeviceRefusal,
  AS_TEXT,
  asCreatedPeer,
  CONFIG_FORBIDDEN,
  DEVICE_NAME_RULE,
  filterPeers,
  isDeviceName,
  networkAccessRefusal,
  PEER_FILTERS,
  REVOKE_FORBIDDEN,
  type PeerFilter,
} from '../core/peers';
import type { PeerEntry, PrivateEdgeEntry } from '../core/peers.consumes';
import {
  NODE_LIST,
  PEER_APP_CONFIG,
  PEER_CONFIG,
  PEER_CREATE,
  PEER_LIST,
  PEER_REVOKE,
  PRIVATE_EDGE,
} from '../core/peers.operations';
import { utcMinute } from '../core/utc-minute';
import { WIREGUARD_KEYS, withPrivateKey } from '../core/wireguard-keys';
import { CopyText } from '../ui/copy-text';
import { QrCode } from '../ui/qr-code';

/** The line that connects this machine: the companion container, through the CLI. */
export const CONNECT_COMMAND = 'qits network-access up';

/** The companion's PAC URL, host-side (qits-network-access-service `proxy.go`, default port). */
export const PAC_URL = 'http://127.0.0.1:47813/proxy.pac';

/** Each filter's button label. */
const FILTER_LABELS: Readonly<Record<PeerFilter, string>> = {
  all: 'All',
  mine: 'Mine',
  devices: 'Devices',
  nodes: 'Nodes',
  revoked: 'Revoked',
};

/** Where a list's read is: still coming, failed, or there. */
type LoadState = 'loading' | 'error' | 'loaded';

/** What Add device says when the browser cannot make WireGuard keys: nothing was sent. */
export const NO_X25519 =
  'This browser cannot make WireGuard keys (its WebCrypto has no X25519), so nothing was sent. ' +
  'Add the device with the qits CLI, or from a current browser.';

/**
 * A device Add device made, shown once: its name and address as the service answered them, and
 * its config with the private key in it. Held only in the page's memory, never sent or stored.
 */
interface AddedDevice {
  readonly name: string;
  readonly tunnelIp: string;
  readonly config: string;
}

/** The private edge, as its read left it: `none` is the service's 404, no edge announced yet. */
type PrivateEdgeRead =
  | { readonly status: 'loading' | 'error' | 'none' }
  | { readonly status: 'loaded'; readonly edge: PrivateEdgeEntry };

/**
 * The Network access page, at `/` of qits-network-access' own host: the platform's private network
 * as qits-network-access sees it, open to anyone signed in. Moved from qits-landing-app's
 * `/network-access` (qits-2361), so that a person not yet on the tunnel can reach it once the
 * landing app is private. Every call is same-origin, to `/network-access/api/...`.
 *
 * It reads through `qitsResource` and writes through `qitsMutation`, over the operations in
 * `peers.operations.ts`:
 *
 * - The peers (`peers`, `PEER_LIST`): name, kind, tunnel IP, owner (a DEVICE's user, a NODE's
 *   joined node, `nodes`, `NODE_LIST`), status and created, newest first. The filters All,
 *   Devices, Nodes and Revoked narrow the one list; Mine reads the visitor's own peers (`mine`,
 *   `PEER_LIST` with `owner=me`), from its first choosing on.
 * - Revoke on an ACTIVE row asks first ("Confirm revoke?"), then `revoking` (`PEER_REVOKE`), which
 *   reads the lists again; a refusal shows under the table in the service's terms (a 403: the
 *   visitor's credential may not revoke peers).
 * - Download WireGuard config on an ACTIVE DEVICE row reads the peer's `wg-quick` text
 *   (`PEER_CONFIG`'s `fetch`) and saves it as `qits.conf`, the `<PRIVATE_KEY>` placeholder kept: an
 *   existing device's key is not the page's.
 * - Add device, for a phone or a laptop without the CLI, while a private edge is announced: a name
 *   the service takes (`isDeviceName`, checked as typed), then the browser makes an X25519 keypair
 *   (`WIREGUARD_KEYS`, WebCrypto), `creating` (`PEER_CREATE`) sends the name and the public key and
 *   reads the lists again, and `PEER_APP_CONFIG`'s `fetch` reads the new peer's config for the
 *   WireGuard apps, whose `<PRIVATE_KEY>` the page fills in memory. The config is shown once
 *   (`added`): a QR code drawn in the page, Download .conf, Copy and the text. The private key is
 *   never sent or stored; Done and leaving the page drop it.
 * - The private edge card (`edgeRead`, `PRIVATE_EDGE`): its endpoint, public key and announce time,
 *   or "No private edge has announced itself yet." on the service's 404.
 * - Connect this machine: the copyable `qits network-access up`, then the companion's copyable PAC
 *   URL for browsers.
 *
 * qits-network-access sends no domain event, so the page reads again only after its own revoke or
 * add, and on Retry.
 */
@Component({
  selector: 'app-network-access-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CopyText, QrCode],
  styleUrl: './network-access.page.css',
  template: `
    <main>
      <h1>Network access</h1>
      <p class="soft">The devices and nodes on the platform’s private network, newest first.</p>

      <section class="card" aria-labelledby="connect-heading">
        <h2 id="connect-heading">Connect this machine</h2>
        <p class="soft">
          Run this with the qits CLI. It registers this machine as a device of yours and runs the
          network-access companion container, so it needs Docker.
        </p>
        <app-copy-text [text]="connectCommand" label="Copy" />
        <p class="muted small">
          For a phone, or a laptop without the CLI, use Add device below: it makes the device’s keys
          in this browser and shows its WireGuard config once. A device row’s Download WireGuard
          config gives its <code>wg-quick</code> file without the key; put your own private key in
          place of <code>&lt;PRIVATE_KEY&gt;</code>.
        </p>

        <h3>Browsers</h3>
        <p class="soft">
          Once <code>qits network-access up</code> is running on this machine, set this URL as the
          automatic proxy configuration URL in your system’s or browser’s proxy settings. Public
          apps keep working while the companion is stopped.
        </p>
        <app-copy-text [text]="pacUrl" label="Copy" />
      </section>

      <section class="card" aria-labelledby="edge-heading" data-private-edge>
        <h2 id="edge-heading">Private edge</h2>
        @switch (edge().status) {
          @case ('loaded') {
            @if (edgeEntry(); as entry) {
              <dl>
                <dt>Endpoint</dt>
                <dd class="mono">{{ entry.publicAddress }}:{{ entry.listenPort }}</dd>
                <dt>Public key</dt>
                <dd class="mono">{{ entry.publicKey }}</dd>
                <dt>Announced</dt>
                <dd>{{ when(entry.announcedAt) }}</dd>
              </dl>
            }
          }
          @case ('none') {
            <p class="soft">No private edge has announced itself yet.</p>
          }
          @case ('error') {
            <p class="danger" role="alert">The private edge could not be read.</p>
          }
          @default {
            <p class="muted">Reading the private edge…</p>
          }
        }
      </section>

      <section class="card" aria-labelledby="add-heading" data-add-device>
        <h2 id="add-heading">Add device</h2>
        @if (added(); as device) {
          <div data-device-config>
            <p class="soft">
              <strong>{{ device.name }}</strong> is added at <code>{{ device.tunnelIp }}</code>.
              Scan the QR code with the WireGuard app, or download the file and import it.
            </p>
            <p class="warning" role="note">
              This config holds the device’s private key. It is shown once and stored nowhere: once
              you close it, it is gone. If it is lost, revoke this device and add it again.
            </p>
            <div class="config">
              <app-qr-code
                class="qr"
                [text]="device.config"
                [label]="'WireGuard config of ' + device.name"
              />
              <div class="config-text">
                <app-copy-text [text]="device.config" label="Copy" />
                <div class="actions">
                  <button type="button" (click)="downloadAdded()">Download .conf</button>
                  <button type="button" class="success" (click)="done()">Done</button>
                </div>
              </div>
            </div>
          </div>
        } @else {
          <p class="soft">
            For a phone or a laptop without the qits CLI. This browser makes the device’s keys; only
            its public key is sent.
          </p>
          <div class="actions">
            <input
              type="text"
              name="device-name"
              aria-label="Device name"
              placeholder="phone"
              autocomplete="off"
              spellcheck="false"
              [value]="name()"
              [attr.aria-invalid]="nameRefused() ? 'true' : null"
              [disabled]="addBlocked() !== null || adding()"
              (input)="name.set(text($event))"
              (keydown.enter)="add()"
            />
            <button
              type="button"
              class="success"
              [disabled]="addBlocked() !== null || adding() || !isDeviceName(name())"
              (click)="add()"
            >
              {{ adding() ? 'Adding…' : 'Add' }}
            </button>
          </div>
          @if (addBlocked(); as why) {
            <p class="muted small" data-add-blocked>{{ why }}</p>
          } @else if (nameRefused()) {
            <p class="danger small" data-name-rule>{{ nameRule }}</p>
          }
          @if (addFailure(); as failure) {
            <p class="danger" role="alert" data-add-refusal>{{ failure }}</p>
          }
        }
      </section>

      <div class="actions filters" role="group" aria-label="Filter peers">
        @for (option of filters; track option) {
          <button type="button" [attr.aria-pressed]="filter() === option" (click)="choose(option)">
            {{ filterLabel(option) }}
          </button>
        }
      </div>

      @if (state() === 'error') {
        <div class="failure" role="alert">
          <span>The peers could not be read.</span>
          <button type="button" (click)="retry()">Retry</button>
        </div>
      } @else {
        <div class="table" [attr.aria-busy]="state() === 'loading'">
          <table aria-label="Peers">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Tunnel IP</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Created</th>
                <th><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (peer of shown(); track peer.id) {
                <tr [attr.data-peer]="peer.id">
                  <td class="name">{{ peer.name }}</td>
                  <td>{{ kindLabel(peer) }}</td>
                  <td class="mono">{{ peer.tunnelIp }}</td>
                  <td>{{ owner(peer) }}</td>
                  <td>
                    <span class="chip" [attr.data-status]="peer.status">{{
                      statusLabel(peer)
                    }}</span>
                  </td>
                  <td class="nowrap">{{ when(peer.createdAt) }}</td>
                  <td>
                    <div class="actions end">
                      @if (downloadable(peer)) {
                        <button
                          type="button"
                          [disabled]="pending() !== null"
                          (click)="download(peer)"
                        >
                          Download WireGuard config
                        </button>
                      }
                      @if (peer.status === 'ACTIVE') {
                        <button
                          type="button"
                          [class.danger]="confirming() === peer.id"
                          [disabled]="pending() !== null"
                          (click)="revokePressed(peer)"
                        >
                          {{ revokeLabel(peer) }}
                        </button>
                        @if (confirming() === peer.id) {
                          <button type="button" (click)="confirming.set(null)">Cancel</button>
                        }
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @if (state() === 'loading') {
            <p class="muted center">Reading the peers…</p>
          } @else if (shown().length === 0) {
            <p class="muted center">No peers match this filter.</p>
          }
        </div>
      }
      @if (failure(); as failure) {
        <p class="danger" role="alert" data-refusal>{{ failure }}</p>
      }
    </main>
  `,
})
export class NetworkAccessPage {
  private readonly document = inject(DOCUMENT);

  protected readonly connectCommand = CONNECT_COMMAND;
  protected readonly pacUrl = PAC_URL;
  protected readonly filters = PEER_FILTERS;
  protected readonly filter = signal<PeerFilter>('all');
  /** The row whose Revoke waits for its confirmation. */
  protected readonly confirming = signal<string | null>(null);
  /** The row whose revoke or download is in flight. */
  protected readonly pending = signal<string | null>(null);
  /** Why the last revoke or download was refused. */
  protected readonly failure = signal<string | null>(null);
  /** Whether Mine was chosen once: its read starts then, and stays. */
  private readonly mineAsked = signal(false);
  /** Makes a new device's keys: WebCrypto, or a spec's fixed pair. */
  private readonly keys = inject(WIREGUARD_KEYS);
  protected readonly nameRule = DEVICE_NAME_RULE;
  /** The name Add device will send, as typed. */
  protected readonly name = signal('');
  /** Whether an add (keys, write, config read) is under way. */
  protected readonly adding = signal(false);
  /** Why the last add did not end with a config shown. */
  protected readonly addFailure = signal<string | null>(null);
  /** The device just added, with its private key: shown once, until Done or leaving the page. */
  protected readonly added = signal<AddedDevice | null>(null);

  /** Every peer. */
  protected readonly peers = qitsResource(PEER_LIST, () => ({}));

  /** The visitor's own peers (`owner=me`), once Mine was chosen. */
  protected readonly mine = qitsResource(PEER_LIST, () =>
    this.mineAsked() ? { query: { owner: 'me' } } : undefined,
  );

  /** The joined nodes, naming a NODE peer's target. */
  protected readonly nodes = qitsResource(NODE_LIST, () => ({}));

  /** The announced private edge; its 404 is "none announced yet". */
  protected readonly edgeRead = qitsResource(PRIVATE_EDGE, () => ({}));

  /** Adds a device peer, then reads the lists again, so its row shows. */
  private readonly creating = qitsMutation(PEER_CREATE, {
    affects: () => [this.peers, this.mine],
  });

  /** Revokes a peer, then reads the lists again. */
  private readonly revoking = qitsMutation(PEER_REVOKE, {
    affects: () => [this.peers, this.nodes, this.mine],
  });

  protected readonly edge = computed((): PrivateEdgeRead => {
    const read = this.edgeRead;
    if (read.status() === 'error') {
      const error = read.error();
      return { status: error instanceof QitsApiError && error.status === 404 ? 'none' : 'error' };
    }
    const edge = read.hasValue() ? read.value() : undefined;
    return edge ? { status: 'loaded', edge } : { status: 'loading' };
  });

  /**
   * Why Add device cannot add now, or null: a peer behind no private edge has no config to
   * connect with, so it waits for one.
   */
  protected readonly addBlocked = computed((): string | null => {
    switch (this.edge().status) {
      case 'loaded':
        return null;
      case 'none':
        return 'No private edge has announced itself yet, so a new device would have nothing to connect to.';
      case 'error':
        return 'The private edge could not be read, so no device can be added now.';
      default:
        return 'Reading the private edge…';
    }
  });

  /** Whether the typed name is one the service refuses (an empty field is not refused yet). */
  protected readonly nameRefused = computed(() => this.name() !== '' && !isDeviceName(this.name()));

  protected readonly isDeviceName = isDeviceName;

  /** Saves the shown config as `qits.conf`, the file name WireGuard apps take as the tunnel's. */
  protected downloadAdded(): void {
    const device = this.added();
    if (device) this.save(CONFIG_FILE, device.config);
  }

  /** Closes the shown config: its private key is dropped with it. */
  protected done(): void {
    this.added.set(null);
  }

  constructor() {
    // Leaving the page drops a config still shown, private key and all.
    inject(DestroyRef).onDestroy(() => this.added.set(null));
  }

  protected readonly edgeEntry = computed(() =>
    this.edgeRead.hasValue() ? this.edgeRead.value() : undefined,
  );

  /** The read the filter shows: Mine's own, else every peer. */
  protected readonly listRead = computed((): QitsResourceRef<readonly PeerEntry[]> =>
    this.filter() === 'mine' ? this.mine : this.peers,
  );

  /** Failed, loaded (a quiet read again included, which keeps the value), else loading. */
  protected readonly state = computed((): LoadState => {
    const read = this.listRead();
    if (read.status() === 'error') return 'error';
    return read.hasValue() ? 'loaded' : 'loading';
  });

  protected readonly shown = computed((): readonly PeerEntry[] => {
    const filter = this.filter();
    if (filter === 'mine') return this.mine.hasValue() ? (this.mine.value() ?? []) : [];
    return filterPeers(this.peers.hasValue() ? (this.peers.value() ?? []) : [], filter);
  });

  /** Each node's name, by the id of its peer. */
  private readonly nodeNames = computed(
    () =>
      new Map(
        (this.nodes.hasValue() ? (this.nodes.value() ?? []) : [])
          .filter((node) => node.peer?.id)
          .map((node) => [node.peer?.id ?? '', node.name ?? '']),
      ),
  );

  protected readonly when = utcMinute;

  protected filterLabel(filter: PeerFilter): string {
    return FILTER_LABELS[filter];
  }

  protected choose(filter: PeerFilter): void {
    this.filter.set(filter);
    this.confirming.set(null);
    if (filter === 'mine') this.mineAsked.set(true);
  }

  protected kindLabel(peer: PeerEntry): string {
    return peer.kind === 'DEVICE' ? 'Device' : peer.kind === 'NODE' ? 'Node' : (peer.kind ?? '');
  }

  protected statusLabel(peer: PeerEntry): string {
    return (peer.status ?? '').toLowerCase();
  }

  /** A DEVICE's owner, a NODE's joined node (its own name while the nodes are not read). */
  protected owner(peer: PeerEntry): string {
    if (peer.kind === 'NODE') return this.nodeNames().get(peer.id ?? '') ?? peer.name ?? '';
    return peer.ownerUserId ?? '';
  }

  protected downloadable(peer: PeerEntry): boolean {
    return peer.kind === 'DEVICE' && peer.status === 'ACTIVE';
  }

  protected revokeLabel(peer: PeerEntry): string {
    if (this.pending() === peer.id) return 'Revoking…';
    return this.confirming() === peer.id ? 'Confirm revoke?' : 'Revoke';
  }

  /** Revoke asks first; its second press revokes. */
  protected revokePressed(peer: PeerEntry): void {
    if (this.confirming() === peer.id) void this.revoke(peer);
    else this.confirming.set(peer.id ?? null);
  }

  /** Reads again what failed: Mine's list, or every peer, the nodes and the edge (not a 404). */
  protected retry(): void {
    const failed = (read: { status(): string }) => read.status() === 'error';
    if (this.filter() === 'mine') {
      if (failed(this.mine)) this.mine.reload();
      return;
    }
    if (failed(this.peers)) this.peers.reload();
    if (failed(this.nodes)) this.nodes.reload();
    if (this.edge().status === 'error') this.edgeRead.reload();
  }

  /** The text of an input event's target. */
  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /**
   * Adds the typed device: makes its keys, sends the name and the public key, reads its config for
   * the WireGuard apps and fills the private key in, then shows it once. The private key lives in
   * this call and in `added`, nowhere else.
   */
  protected async add(): Promise<void> {
    const name = this.name();
    if (this.adding() || this.addBlocked() !== null || !isDeviceName(name)) return;
    this.addFailure.set(null);
    this.adding.set(true);
    try {
      let keys;
      try {
        keys = await this.keys();
      } catch {
        this.addFailure.set(NO_X25519);
        return;
      }
      let peer;
      try {
        peer = asCreatedPeer(
          await this.creating.run({ body: { name, publicKey: keys.publicKey } }),
        );
      } catch (error) {
        this.addFailure.set(
          error instanceof QitsApiError
            ? addDeviceRefusal(error.error, error.status)
            : addDeviceRefusal(undefined, undefined),
        );
        return;
      }
      const shownName = peer?.name || name;
      const config = peer?.id
        ? await PEER_APP_CONFIG.fetch({ path: { peerId: peer.id }, ...AS_TEXT }).catch(
            () => undefined,
          )
        : undefined;
      const text = config?.data as unknown;
      if (!config || config.error !== undefined || typeof text !== 'string') {
        this.addFailure.set(
          `${shownName} was added, but its config could not be read, and its private key is gone ` +
            'with it. Revoke it and add it again.',
        );
        return;
      }
      this.name.set('');
      this.added.set({
        name: shownName,
        tunnelIp: peer?.tunnelIp ?? '',
        config: withPrivateKey(text, keys.privateKey),
      });
    } finally {
      this.adding.set(false);
    }
  }

  private async revoke(peer: PeerEntry): Promise<void> {
    const id = peer.id;
    if (!id) return;
    this.confirming.set(null);
    this.failure.set(null);
    this.pending.set(id);
    try {
      const peer = await this.revoking.run({ path: { peerId: id } });
      // A 2xx that does not answer the peer REVOKED is refused all the same.
      if (peer?.status !== 'REVOKED') {
        this.failure.set(networkAccessRefusal(undefined, 200, REVOKE_FORBIDDEN));
      }
    } catch (error) {
      this.failure.set(refusalOf(error, REVOKE_FORBIDDEN));
    } finally {
      this.pending.set(null);
    }
  }

  protected async download(peer: PeerEntry): Promise<void> {
    const id = peer.id;
    if (!id) return;
    this.failure.set(null);
    this.pending.set(id);
    try {
      const { data, error, response } = await PEER_CONFIG.fetch({
        path: { peerId: id },
        ...AS_TEXT,
      });
      const text = data as unknown;
      if (error !== undefined || typeof text !== 'string') {
        this.failure.set(networkAccessRefusal(error, response?.status, CONFIG_FORBIDDEN));
        return;
      }
      this.save(CONFIG_FILE, text);
    } finally {
      this.pending.set(null);
    }
  }

  /**
   * Hands `text` to the browser as a file download, through a `data:` link. Typed
   * `application/octet-stream`, not `text/plain`: Android Chrome appends `.txt` to a `text/plain`
   * download, and the WireGuard app then cannot import `qits.conf.txt` as it is.
   */
  private save(filename: string, text: string): void {
    const link = this.document.createElement('a');
    link.href = `data:application/octet-stream;charset=utf-8,${encodeURIComponent(text)}`;
    link.download = filename;
    link.rel = 'noopener';
    link.click();
  }
}

/**
 * Every download's file name. A WireGuard app names the tunnel after the file (wg-quick its
 * interface, at most 15 characters), so it is the platform's, not the device's: `qits`.
 */
const CONFIG_FILE = 'qits.conf';

/** Why a mutation was refused, for a person: its `QitsApiError`'s status and body, else unreachable. */
function refusalOf(error: unknown, forbidden: string): string {
  return error instanceof QitsApiError
    ? networkAccessRefusal(error.error, error.status, forbidden)
    : networkAccessRefusal(undefined, undefined, forbidden);
}
