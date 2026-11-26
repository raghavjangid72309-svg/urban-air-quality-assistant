import { describe, expect, it } from 'vitest';
import { API_ORIGINS, CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_HEADER } from '../config/csp';
import html from '../index.html?raw';
import vercel from '../vercel.json';
import { AIR_QUALITY_ENDPOINT, GEOCODING_ENDPOINT } from './api/openMeteo';

const pageHeaders = vercel.headers.find((rule) => rule.source === '/(.*)')?.headers ?? [];
const header = (key: string) => pageHeaders.find((h) => h.key === key)?.value;

describe('content security policy', () => {
  it('is identical in the build and the hosting headers', () => {
    expect(header('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY_HEADER);
    expect(CONTENT_SECURITY_POLICY_HEADER.startsWith(CONTENT_SECURITY_POLICY)).toBe(true);
  });

  it('allows no inline code, eval or wildcards', () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(CONTENT_SECURITY_POLICY).toMatch(/default-src 'none'/);
    expect(CONTENT_SECURITY_POLICY).toMatch(/require-trusted-types-for 'script'/);
  });

  it('lets the app reach exactly the APIs it uses', () => {
    const used = [AIR_QUALITY_ENDPOINT, GEOCODING_ENDPOINT].map((url) => new URL(url).origin);
    expect([...API_ORIGINS].sort()).toEqual(used.sort());
  });
});

describe('hosting headers', () => {
  it('sets defensive headers', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('no-referrer');
    expect(header('Permissions-Policy')).toMatch(/geolocation=\(self\)/);
    expect(header('Strict-Transport-Security')).toMatch(/max-age=\d+/);
  });
});

describe('index.html', () => {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  it('has no inline scripts, handlers or styles', () => {
    for (const script of doc.querySelectorAll('script')) {
      expect(script.getAttribute('src')).toBeTruthy();
      expect(script.textContent.trim()).toBe('');
    }
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(doc.querySelectorAll('[style], style')).toHaveLength(0);
  });

  it('opens external links without leaking the opener or referrer', () => {
    const external = [...doc.querySelectorAll('a[href^="http"]')];
    expect(external.length).toBeGreaterThan(0);
    for (const link of external) expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('declares a language, title and viewport', () => {
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.title).toMatch(/AirWise/);
    expect(doc.querySelector('meta[name="viewport"]')).not.toBeNull();
  });
});
