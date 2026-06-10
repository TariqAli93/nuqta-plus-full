import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../helpers/env';
import { ApiClient } from '../helpers/api';

/**
 * Auth bootstrap (runs once, before the main project).
 *
 * Logs in via the API, then writes a Playwright storageState that seeds the
 * SPA's localStorage for the app origin. The frontend's axios request
 * interceptor reads the token from the Pinia auth store, which itself
 * initialises from `localStorage.token` on boot — so seeding the token (plus
 * the cached session payload) yields a fully-authenticated, hydrated app
 * without driving the login form on every spec.
 *
 * The login form itself is covered separately in specs/auth/login.spec.ts.
 */
setup('authenticate as admin', async ({ request }) => {
  const client = await ApiClient.signIn(request, ENV.admin);
  const origin = new URL(ENV.baseURL).origin;

  const entry = (name: string, value: string) => ({ name, value });
  const storageState = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          entry('token', client.token),
          entry('user', JSON.stringify(client.session.user)),
          entry('featureFlags', JSON.stringify(client.session.featureFlags)),
          entry('capabilities', JSON.stringify(client.session.capabilities)),
          ...(client.session.scope ? [entry('scope', JSON.stringify(client.session.scope))] : []),
        ],
      },
    ],
  };

  const file = path.resolve(ENV.adminStatePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(storageState, null, 2));
  expect(fs.existsSync(file), 'storageState was written').toBeTruthy();
});
