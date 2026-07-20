import { afterEach, beforeEach, test, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from '../app/App';

beforeEach(() => {
  // The FX auto-refresh hook calls fetch on mount — keep tests offline.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network disabled in tests'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Mounts the real RouterProvider at "/"; with no session the layout guard
// redirects to /login, so the Login screen must render.
test('admin dashboard mounts and guards unauthenticated users to login', async () => {
  render(<App />);
  expect(await screen.findByText(/Enter your credentials/i)).toBeTruthy();
});
