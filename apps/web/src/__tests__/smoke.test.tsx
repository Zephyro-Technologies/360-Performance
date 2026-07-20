import { afterEach, test, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from '../app/App';

afterEach(() => {
  cleanup();
});

// Mounts the real RouterProvider at "/" → Landing inside the shared Layout.
test('web storefront mounts and renders the footer chrome', async () => {
  render(<App />);
  expect(await screen.findByText(/All rights reserved/i)).toBeTruthy();
});
