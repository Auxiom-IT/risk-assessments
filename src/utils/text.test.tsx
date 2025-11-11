import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderIssueWithLinks } from './text';

describe('renderIssueWithLinks', () => {
  it('should render plain text without links', () => {
    const text = 'This is a plain text message without any URLs';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    expect(container.querySelector('li')).toBeTruthy();
    expect(container.textContent).toBe(text);
    expect(container.querySelector('a')).toBeNull();
  });

  it('should render text with a single URL as clickable link', () => {
    const text = 'Check out https://example.com for more info';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toBe('https://example.com');
  });

  it('should render text with multiple URLs as clickable links', () => {
    const text = 'Visit https://example.com or https://test.com for help';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('https://example.com');
    expect(links[1].getAttribute('href')).toBe('https://test.com');
  });

  it('should handle URLs with query parameters', () => {
    const text = 'Use this tool: https://easydmarc.com/tools/dkim-lookup?domain=example.com';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://easydmarc.com/tools/dkim-lookup?domain=example.com');
  });

  it('should handle URLs in parentheses', () => {
    const text = 'Check the tool (https://example.com) for details';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(container.textContent).toContain('Check the tool (');
    expect(container.textContent).toContain(') for details');
  });

  it('should handle http:// URLs', () => {
    const text = 'Visit http://example.com for more';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('http://example.com');
  });

  it('should preserve text before and after URLs', () => {
    const text = 'Start text https://example.com end text';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    expect(container.textContent).toBe('Start text https://example.com end text');
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBeGreaterThan(0);
  });

  it('should use the provided index as key', () => {
    const text = 'Some text';
    const result = renderIssueWithLinks(text, 42);

    const { container } = render(<ul>{result}</ul>);

    const li = container.querySelector('li');
    expect(li).toBeTruthy();
  });

  it('should handle URLs with paths and fragments', () => {
    const text = 'See https://example.com/path/to/page#section for details';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/path/to/page#section');
  });

  it('should handle real DKIM warning message', () => {
    const text = 'To verify DKIM is configured, try: 1) Check your email provider\'s documentation ' +
      'for your selector name, 2) Use EasyDMARC\'s free DKIM Lookup tool ' +
      '(https://easydmarc.com/tools/dkim-lookup) to auto-detect, or 3) Inspect email headers';

    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://easydmarc.com/tools/dkim-lookup');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(container.textContent).toContain('To verify DKIM is configured');
    expect(container.textContent).toContain('to auto-detect');
  });

  it('should handle empty string', () => {
    const text = '';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    expect(container.querySelector('li')).toBeTruthy();
    expect(container.textContent).toBe('');
    expect(container.querySelector('a')).toBeNull();
  });

  it('should handle text with only a URL', () => {
    const text = 'https://example.com';
    const result = renderIssueWithLinks(text, 0);

    const { container } = render(<ul>{result}</ul>);

    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://example.com');
    // Should have empty spans before/after
    expect(container.querySelector('li')?.childNodes.length).toBeGreaterThan(1);
  });
});
