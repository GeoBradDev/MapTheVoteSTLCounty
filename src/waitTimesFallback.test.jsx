import { act, render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from './App.jsx';
import { unmountThenUnstub } from './test/teardown.js';

// The wait times page's chunk (#104) loads only when the test lets it, so the
// test can look at the page while its code is still on the way.
let release;
const chunk = new Promise((resolve) => {
  release = resolve;
});
vi.mock('./features/waitTimes/WaitTimesPage.jsx', async () => {
  await chunk;
  return { default: () => <h1 tabIndex={-1}>Loaded page</h1> };
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(async () => {
  await unmountThenUnstub();
});

// #151: the heading and intro, the page's largest text, paint while the page's
// code loads, so its Largest Contentful Paint waits on neither that chunk nor
// the data requests the page starts.
it('shows the wait times heading and intro while the page code loads', async () => {
  const location = memoryLocation({ path: '/early-voting' });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );

  const heading = screen.getByRole('heading', { level: 1 });
  expect(heading).toHaveTextContent('Early voting wait times');
  // Not focusable, so the in-app arrival focus finds no heading and the page
  // focuses its own when it arrives.
  expect(heading).not.toHaveAttribute('tabindex');
  expect(screen.getByText(/How many people are in line right now/)).toBeInTheDocument();
  expect(screen.getByText(/Each board's sites are for its own voters/)).toBeInTheDocument();

  await act(async () => release());
  expect(await screen.findByRole('heading', { name: 'Loaded page' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.queryByText(/How many people are in line right now/)).not.toBeInTheDocument();
});
