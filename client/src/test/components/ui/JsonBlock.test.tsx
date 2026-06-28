import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { JsonBlock } from '@/components/ui/JsonBlock';

describe('JsonBlock', () => {
  it('renders JSON data', () => {
    render(<JsonBlock data={{ foo: 'bar' }} />);
    expect(screen.getByText(/"foo"/)).toBeInTheDocument();
    expect(screen.getByText(/"bar"/)).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<JsonBlock data={{}} label="Response" />);
    expect(screen.getByText('Response')).toBeInTheDocument();
  });

  it('renders array data', () => {
    const { container } = render(<JsonBlock data={[1, 2, 3]} />);
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toContain('1');
    expect(pre?.textContent).toContain('3');
  });

  it('renders null as stringified', () => {
    const { container } = render(<JsonBlock data={null} />);
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toBe('null');
  });

  it('copy button copies text to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<JsonBlock data={{ key: 'value' }} label="Response" />);
    const copyBtn = screen.getByText('Copy');
    await act(async () => { fireEvent.click(copyBtn); });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"key"'));
  });
});
