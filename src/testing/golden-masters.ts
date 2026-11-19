import { goldenMasters } from '@qits/angular/testing';

/** qits-network-access' golden masters, from its npm package `@qits/network-access-golden-masters`. */
export const networkAccessGoldenMasters = goldenMasters(
  '@qits/network-access-golden-masters',
  'qits-network-access',
);

/** The body qits-network-access recorded for `operationId` in `state`, for a spec to `flush(...)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the recorded JSON, typed by the caller
export const networkAccessGoldenMaster = <T = any>(state: string, operationId: string): T =>
  networkAccessGoldenMasters.body<T>(state, operationId);
