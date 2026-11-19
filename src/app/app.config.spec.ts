import { HttpBackend, HttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { QITS_SIGN_IN, QitsTokens } from '@qits/angular';
import { appConfig } from './app.config';
import { client as networkAccessClient } from './api/network-access/client.gen';
import { getNodes } from './api/network-access';

/**
 * The wiring every sibling SPA asserts: the fetch backend, the qits-spa sign-in and the bearer on
 * the page's own calls. Here also: the generated client goes through that `HttpClient`, to this
 * page's own origin (no base URL), and the router has the sign-in callback in front of the page.
 */
describe('appConfig', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
  });

  it('provides an HttpClient on the fetch backend', () => {
    expect(TestBed.inject(HttpClient)).toBeTruthy();
    expect(TestBed.inject(HttpBackend).constructor.name).toContain('Fetch');
  });

  it('signs in with the qits-spa client', () => {
    expect(TestBed.inject(QITS_SIGN_IN).clientId).toBe('qits-spa');
  });

  it('routes the sign-in callback, and sends any other path to the page', () => {
    const paths = TestBed.inject(Router).config.map((route) => route.path);
    expect(paths).toContain('auth/callback');
    expect(paths.indexOf('auth/callback')).toBeLessThan(paths.indexOf('**'));
  });

  it('calls qits-network-access on its own origin, with the bearer', async () => {
    const tokens = { accessToken: async () => 'A1' };
    TestBed.overrideProvider(QitsTokens, { useValue: tokens });
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(networkAccessClient.getConfig().baseUrl ?? '').toBe('');
    const http = TestBed.inject(HttpTestingController);
    const answer = TestBed.runInInjectionContext(() => getNodes());
    let request: TestRequest | undefined;
    await vi.waitFor(() => {
      [request] = http.match('/network-access/api/nodes');
      expect(request).toBeTruthy();
    });
    expect(request!.request.headers.get('authorization')).toBe('Bearer A1');
    request!.flush([]);
    expect((await answer).data).toEqual([]);
  });
});
