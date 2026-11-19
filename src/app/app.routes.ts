import type { Routes } from '@angular/router';
import { NetworkAccessPage } from './page/network-access.page';

/**
 * One page, at `/` of the service's own host: `network-access.<env>.<domain>/`, where
 * qits-network-access-service serves this frontend through Quinoa. `/network-access` is the
 * service's wire prefix (`/network-access/api`, `/network-access/q`), held back from the SPA
 * fallback by `quarkus.quinoa.ignored-path-prefixes`, so the page cannot live there.
 *
 * `/auth/callback` is not listed here: `provideQitsBearerSignIn` puts it in front of these routes.
 * Any other path is the page, so a stale bookmark still lands somewhere useful.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', component: NetworkAccessPage },
  { path: '**', redirectTo: '' },
];
