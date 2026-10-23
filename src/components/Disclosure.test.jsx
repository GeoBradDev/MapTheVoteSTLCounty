import { act, render, screen } from '@testing-library/react';
import Disclosure from './Disclosure.jsx';

const details = () => screen.getByText('More').closest('details');

describe('Disclosure', () => {
  it('starts closed, or open with defaultOpen', () => {
    const { unmount } = render(<Disclosure summary="More">Body</Disclosure>);
    expect(details()).not.toHaveAttribute('open');
    unmount();
    render(
      <Disclosure summary="More" defaultOpen>
        Body
      </Disclosure>,
    );
    expect(details()).toHaveAttribute('open');
  });

  it('opens for printing and folds back afterwards, as topic pages do', () => {
    render(<Disclosure summary="More">Body</Disclosure>);
    act(() => window.dispatchEvent(new Event('beforeprint')));
    expect(details()).toHaveAttribute('open');
    act(() => window.dispatchEvent(new Event('afterprint')));
    expect(details()).not.toHaveAttribute('open');
  });

  it('leaves one the voter opened open after printing', () => {
    render(<Disclosure summary="More">Body</Disclosure>);
    details().open = true;
    act(() => window.dispatchEvent(new Event('beforeprint')));
    act(() => window.dispatchEvent(new Event('afterprint')));
    expect(details()).toHaveAttribute('open');
  });
});
