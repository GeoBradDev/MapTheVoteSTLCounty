import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import UseMyLocation from './UseMyLocation.jsx';
import { copy } from './useMyLocationCopy.js';

const POSITION = { coords: { latitude: 38.62, longitude: -90.33, accuracy: 12 }, timestamp: 1 };

// Holds the callbacks of each getCurrentPosition call so a test decides when
// and how the browser answers.
let pending;
let getCurrentPosition;

beforeEach(() => {
  pending = [];
  getCurrentPosition = vi.fn((ok, fail) => pending.push({ ok, fail }));
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
});

function Harness({ onLocate = () => {} }) {
  const addressRef = useRef(null);
  return (
    <>
      <label>
        Enter your address
        <input ref={addressRef} />
      </label>
      <UseMyLocation onLocate={onLocate} addressInputRef={addressRef} />
    </>
  );
}

const button = () => screen.getByRole('button', { name: /location/i });
const address = () => screen.getByRole('textbox', { name: 'Enter your address' });

async function answer(fn) {
  await act(async () => {
    fn(pending.shift());
  });
}

describe('UseMyLocation', () => {
  it('does not ask for the location until the button is pressed', () => {
    render(<Harness />);
    expect(button()).toHaveTextContent(copy.button);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('explains how the location is used and warns it may not be home', () => {
    render(<Harness />);
    expect(screen.getByText(copy.privacy)).toBeInTheDocument();
    expect(screen.getByText(copy.notHome)).toBeInTheDocument();
    expect(copy.privacy).toMatch(/only to find your precinct/);
    expect(copy.notHome).toMatch(/home address/);
  });

  it('passes only the coordinates to onLocate', async () => {
    const onLocate = vi.fn();
    render(<Harness onLocate={onLocate} />);
    await userEvent.click(button());
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    await answer(({ ok }) => ok(POSITION));
    expect(onLocate).toHaveBeenCalledTimes(1);
    expect(onLocate).toHaveBeenCalledWith({ lat: 38.62, lng: -90.33 });
    expect(button()).toHaveTextContent(copy.button);
    expect(button()).not.toHaveAttribute('aria-disabled');
  });

  it('shows it is busy, stays focusable and ignores presses while waiting', async () => {
    const onLocate = vi.fn();
    render(<Harness onLocate={onLocate} />);
    await userEvent.click(button());
    expect(button()).toHaveTextContent(copy.busy);
    expect(button()).toHaveAttribute('aria-disabled', 'true');
    expect(button()).not.toBeDisabled();
    await userEvent.click(button());
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    await answer(({ ok }) => ok(POSITION));
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ])('on error code %i shows the %s message and focuses the address box', async (code, reason) => {
    const onLocate = vi.fn();
    render(<Harness onLocate={onLocate} />);
    await userEvent.click(button());
    await answer(({ fail }) => fail({ code, message: 'x' }));
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors[reason]);
    expect(address()).toHaveFocus();
    expect(address()).toBeEnabled();
    expect(onLocate).not.toHaveBeenCalled();
    expect(button()).toHaveTextContent(copy.button);
  });

  it('says a rough fix is only an estimate and focuses the address box', async () => {
    const onLocate = vi.fn();
    render(<Harness onLocate={onLocate} />);
    await userEvent.click(button());
    await answer(({ ok }) =>
      ok({ coords: { latitude: 38.62, longitude: -90.33, accuracy: 3000 } }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.coarse);
    expect(copy.errors.coarse).toMatch(/roughly/);
    expect(copy.errors.coarse).toMatch(/type your address/i);
    expect(address()).toHaveFocus();
    expect(onLocate).not.toHaveBeenCalled();
    expect(button()).toHaveTextContent(copy.button);
  });

  it('names HTTPS when the page is not a secure context, without asking', async () => {
    vi.stubGlobal('isSecureContext', false);
    render(<Harness />);
    await userEvent.click(button());
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.insecure);
    expect(copy.errors.insecure).toMatch(/HTTPS/);
    expect(address()).toHaveFocus();
  });

  it('replaces the message node on a repeated instant failure so it is announced again', async () => {
    vi.stubGlobal('isSecureContext', false);
    render(<Harness />);
    await userEvent.click(button());
    const first = screen.getByRole('alert').firstElementChild;
    expect(first).toHaveTextContent(copy.errors.insecure);
    await userEvent.click(button());
    const second = screen.getByRole('alert').firstElementChild;
    expect(second).toHaveTextContent(copy.errors.insecure);
    expect(second).not.toBe(first);
  });

  it('says so when the browser has no location support', async () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    render(<Harness />);
    await userEvent.click(button());
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.unsupported);
  });

  it('clears the message when trying again, and can succeed after a failure', async () => {
    const onLocate = vi.fn();
    render(<Harness onLocate={onLocate} />);
    await userEvent.click(button());
    await answer(({ fail }) => fail({ code: 3 }));
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.timeout);
    await userEvent.click(button());
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    await answer(({ ok }) => ok(POSITION));
    expect(onLocate).toHaveBeenCalledWith({ lat: 38.62, lng: -90.33 });
  });

  it('works without an address box to focus', async () => {
    render(<UseMyLocation onLocate={() => {}} />);
    await userEvent.click(button());
    await answer(({ fail }) => fail({ code: 1 }));
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errors.denied);
  });

  it('drops a late result once the voter starts typing an address', async () => {
    const onLocate = vi.fn();
    render(<Harness onLocate={onLocate} />);
    await userEvent.click(button());
    await userEvent.type(address(), '1 Main St');
    expect(button()).toHaveTextContent(copy.button);
    expect(button()).not.toHaveAttribute('aria-disabled');
    await answer(({ ok }) => ok(POSITION));
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('does not pull focus back or show an error for a late failure after typing', async () => {
    render(<Harness />);
    await userEvent.click(button());
    await userEvent.type(address(), '1 Main St');
    await userEvent.tab();
    await answer(({ fail }) => fail({ code: 3 }));
    expect(address()).not.toHaveFocus();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('drops a late result once the voter goes back to the address box', async () => {
    const onLocate = vi.fn();
    render(<Harness onLocate={onLocate} />);
    await userEvent.type(address(), '1 Main St');
    await userEvent.click(button());
    await userEvent.click(address());
    expect(button()).toHaveTextContent(copy.button);
    await answer(({ ok }) => ok(POSITION));
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('keeps the request when the page gets focus back after the permission prompt', async () => {
    // Safari does not focus a tapped button, so the address box can still be
    // the focused element; the browser fires focus on it when the prompt closes.
    const onLocate = vi.fn();
    render(<Harness onLocate={onLocate} />);
    await userEvent.click(button());
    address().dispatchEvent(new FocusEvent('focus'));
    await answer(({ ok }) => ok(POSITION));
    expect(onLocate).toHaveBeenCalledWith({ lat: 38.62, lng: -90.33 });
  });

  it('keeps the request when a touch scroll starts on the address box', async () => {
    // A finger that lands on the box and then scrolls fires pointerdown and
    // pointercancel, never a click.
    const onLocate = vi.fn();
    render(<Harness onLocate={onLocate} />);
    await userEvent.click(button());
    act(() => {
      address().dispatchEvent(new Event('pointerdown', { bubbles: true }));
      address().dispatchEvent(new Event('pointercancel', { bubbles: true }));
    });
    expect(button()).toHaveTextContent(copy.busy);
    await answer(({ ok }) => ok(POSITION));
    expect(onLocate).toHaveBeenCalledWith({ lat: 38.62, lng: -90.33 });
  });

  it('drops a late result once the address form is submitted', async () => {
    const onLocate = vi.fn();
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <Harness onLocate={onLocate} />
        <button type="submit">Search</button>
      </form>,
    );
    await userEvent.type(address(), '1 Main St');
    await userEvent.click(button());
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await answer(({ ok }) => ok(POSITION));
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('tells screen readers it is finding the location', async () => {
    render(<Harness />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await userEvent.click(button());
    expect(screen.getByRole('status')).toHaveTextContent(copy.busy);
    await answer(({ ok }) => ok(POSITION));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('drops a result that arrives after it unmounts', async () => {
    const onLocate = vi.fn();
    const { unmount } = render(<Harness onLocate={onLocate} />);
    await userEvent.click(button());
    unmount();
    await answer(({ ok }) => ok(POSITION));
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('keeps the coordinates out of the URL and browser storage', async () => {
    render(<Harness />);
    const before = window.location.href;
    await userEvent.click(button());
    await answer(({ ok }) => ok(POSITION));
    expect(window.location.href).toBe(before);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(document.body.textContent).not.toMatch(/38\.62|90\.33/);
  });

  it('has copy for every failure reason and names no party or candidate', () => {
    expect(Object.keys(copy.errors).sort()).toEqual(
      ['coarse', 'denied', 'insecure', 'timeout', 'unavailable', 'unsupported'].sort(),
    );
    expect(JSON.stringify(copy)).not.toMatch(
      /democrat|republican|libertarian|green party|candidate/i,
    );
  });
});
