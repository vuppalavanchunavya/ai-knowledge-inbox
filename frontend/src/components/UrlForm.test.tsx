import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UrlForm } from './UrlForm';

describe('UrlForm', () => {
  it('rejects empty, malformed, and non-HTTP URLs', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<UrlForm submitting={false} message={null} error={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Add URL' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A URL is required.');

    await user.type(screen.getByLabelText('URL'), 'not a url');
    await user.click(screen.getByRole('button', { name: 'Add URL' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid HTTP or HTTPS URL.');

    await user.clear(screen.getByLabelText('URL'));
    await user.type(screen.getByLabelText('URL'), 'ftp://example.com/file');
    await user.click(screen.getByRole('button', { name: 'Add URL' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Only HTTP and HTTPS URLs can be saved.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows ingestion progress and submits an HTTP URL', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    const { rerender } = render(<UrlForm submitting={false} message={null} error={null} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('URL'), 'https://example.com/article');
    await user.click(screen.getByRole('button', { name: 'Add URL' }));
    expect(onSubmit).toHaveBeenCalledWith({ url: 'https://example.com/article' });

    rerender(<UrlForm submitting message={null} error={null} onSubmit={onSubmit} />);
    expect(screen.getByRole('status')).toHaveTextContent('Fetching and indexing the page…');
    expect(screen.getByRole('button', { name: 'Adding URL…' })).toBeDisabled();
  });

  it('shows a server-side fetch failure', () => {
    render(
      <UrlForm
        submitting={false}
        message={null}
        error="The page could not be reached."
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('could not be reached');
  });
});
