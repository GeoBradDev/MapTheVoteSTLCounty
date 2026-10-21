import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { shareUrl, siteUrl } from '../../config/site.js';
import { copy } from './resultsCopy.js';
import ShareLink from './ShareLink.jsx';

const button = () => screen.getByRole('button', { name: copy.share.button });
const status = () => screen.getByRole('status');

// Own properties on the real navigator, so user-event still sees the rest.
function stubNavigator({ share, clipboard } = {}) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

afterEach(() => {
  delete navigator.share;
  delete navigator.clipboard;
});

describe('shareUrl', () => {
  it('is the production origin and the precinct path, nothing else', () => {
    expect(siteUrl).toBe('https://mapthevotestl.com');
    expect(shareUrl('CC007')).toBe('https://mapthevotestl.com/p/CC007');
  });
});

describe('ShareLink', () => {
  it('says the link shows the precinct, not the address', () => {
    stubNavigator();
    render(<ShareLink code="CC007" />);
    expect(screen.getByText(copy.share.note('CC007'))).toBeInTheDocument();
    expect(status()).toHaveTextContent(/^$/);
  });

  it('opens the share sheet with only a title and the link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareLink code="CC007" />);
    await userEvent.click(button());
    expect(share).toHaveBeenCalledWith({
      title: copy.share.title('CC007'),
      url: 'https://mapthevotestl.com/p/CC007',
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent(/^$/);
  });

  it('does nothing more when the voter cancels the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareLink code="CC007" />);
    await userEvent.click(button());
    expect(writeText).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent(/^$/);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens one share sheet for a second press while it is open', async () => {
    let close;
    const share = vi.fn(() => new Promise((resolve) => (close = resolve)));
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareLink code="CC007" />);
    await userEvent.click(button());
    await userEvent.click(button());
    expect(share).toHaveBeenCalledTimes(1);
    close();
    await userEvent.click(button());
    expect(share).toHaveBeenCalledTimes(2);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the link and says so when the browser cannot share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });
    render(<ShareLink code="CC007" />);
    await userEvent.click(button());
    expect(writeText).toHaveBeenCalledWith('https://mapthevotestl.com/p/CC007');
    expect(status()).toHaveTextContent(copy.share.copied);
  });

  it('copies the link when sharing fails for another reason', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('No', 'NotAllowedError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    render(<ShareLink code="CC007" />);
    await userEvent.click(button());
    expect(writeText).toHaveBeenCalledWith('https://mapthevotestl.com/p/CC007');
    expect(status()).toHaveTextContent(copy.share.copied);
  });

  it.each([
    ['fails', { writeText: vi.fn().mockRejectedValue(new Error('denied')) }],
    ['is missing', undefined],
  ])('shows the link to copy by hand when the clipboard %s', async (_, clipboard) => {
    stubNavigator({ clipboard });
    render(<ShareLink code="CC007" />);
    await userEvent.click(button());
    const field = screen.getByRole('textbox', { name: copy.share.manual });
    expect(field).toHaveValue('https://mapthevotestl.com/p/CC007');
    expect(field).toHaveAttribute('readonly');
    expect(field).toHaveFocus();
    expect(status()).toHaveTextContent(/^$/);
  });
});
