import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideQitsBearerSignIn, qitsBearerInterceptor } from '@qits/angular';
import { client as networkAccessClient } from './api/network-access/client.gen';
import { provideHeyApiClient } from './api/network-access/client/client.gen';

import { routes } from './app.routes';

/**
 * Four providers, and deliberately no more (qits-2361).
 *
 * - `provideBrowserGlobalErrorListeners` funnels genuinely-global errors and unhandled rejections
 *   into Angular's `ErrorHandler`.
 * - `provideQitsBearerSignIn({ clientId: 'qits-spa' })` signs this page in with the idp's public PKCE
 *   client and puts `/auth/callback` in front of the app's own routes, as every SPA on the platform
 *   does. qits-idp is the only other host this page reaches, and only through the sign-in.
 * - `provideHttpClient(withFetch(), withInterceptors([qitsBearerInterceptor]))`: the bearer on every
 *   call. `withFetch` is what `qitsBearerInterceptor` needs, and it keeps client spans visible to
 *   fetch instrumentation.
 * - `provideHeyApiClient(networkAccessClient)` sends the generated qits-network-access client's calls
 *   through that `HttpClient`. Its `baseUrl` stays empty, so every call goes to this page's own
 *   origin, `/network-access/api/...` — the service that serves this page answers them.
 *
 * What is NOT here is the point: no `@qits/ui-components` chrome, no `/main-navigation`, no
 * `provideQitsProjects` and no `provideQitsBuilds`. Those call qits-projects and qits-ci, which are
 * private, and this page exists for the person who is not on the private network yet.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideQitsBearerSignIn({ clientId: 'qits-spa' }),
    provideHttpClient(withFetch(), withInterceptors([qitsBearerInterceptor])),
    provideHeyApiClient(networkAccessClient),
  ],
};
