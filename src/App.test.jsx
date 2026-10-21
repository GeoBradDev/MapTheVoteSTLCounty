import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from './App.jsx';

function renderAt(path) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return location;
}

function heading() {
  return screen.getByRole('heading', { level: 1 });
}

describe('App', () => {
  it('renders the main landmark with the app heading at /', () => {
    renderAt('/');

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
  });

  it('renders the home page from the real browser location without a Router', () => {
    render(<App />);

    expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
  });

  it('shows the precinct code from /p/:precinct', () => {
    renderAt('/p/CC007');

    expect(screen.getByRole('main')).toHaveTextContent('CC007');
    expect(heading()).not.toHaveTextContent('Page not found');
  });

  it('renders the learn page at /learn', () => {
    renderAt('/learn');

    expect(heading()).toHaveTextContent('How to vote');
  });

  it('renders a topic page at /learn/:topic', () => {
    renderAt('/learn/voter-id');

    expect(heading()).not.toHaveTextContent('Page not found');
    expect(screen.getByRole('link', { name: /all topics/i })).toHaveAttribute('href', '/learn');
  });

  it.each(['/p/CC007/', '/learn/', '/learn/voter-id/'])(
    'treats a trailing slash as the same page for %s',
    (path) => {
      renderAt(path);

      expect(heading()).not.toHaveTextContent('Page not found');
    },
  );

  it.each(['/nope', '/p', '/p/CC007/extra', '/learn/a/b'])(
    'shows the not-found page inside main for %s',
    (path) => {
      renderAt(path);

      const main = screen.getByRole('main');
      expect(heading()).toHaveTextContent('Page not found');
      expect(main).toContainElement(heading());
      expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    },
  );

  it('navigates home from the not-found page without a full reload', async () => {
    const location = renderAt('/nope');

    await userEvent.click(screen.getByRole('link', { name: /home/i }));

    expect(location.history).toEqual(['/nope', '/']);
    expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
  });
});
