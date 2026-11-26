# Security

## Reporting a problem

Please report security issues privately through GitHub's **Report a vulnerability** button on the repository's
Security tab rather than in a public issue. You should get a reply within a few days.

## How AirWise is protected

| Risk | Measure | Where |
| --- | --- | --- |
| Cross-site scripting | All content is built with DOM APIs and `textContent`; HTML strings are never parsed. ESLint bans `innerHTML`, `outerHTML`, `insertAdjacentHTML` and `document.write`, and the DOM helper refuses `on*` and `style` attributes. | `src/ui/dom.ts`, `eslint.config.js` |
| Script injection at runtime | Strict Content Security Policy with `default-src 'none'`, no `unsafe-inline` or `unsafe-eval`, and Trusted Types enforced, so the browser itself blocks HTML string sinks. | `config/csp.ts`, `vite.config.ts`, `vercel.json` |
| Data exfiltration | `connect-src` allows only the two Open-Meteo API origins. Requests send no cookies (`credentials: 'omit'`) and no referrer. | `config/csp.ts`, `src/api/http.ts` |
| Untrusted API responses | Every response is validated at runtime (types, ranges, lengths, timestamps) before use; invalid entries are dropped and malformed payloads raise a typed error. | `src/api/openMeteo.ts` |
| Untrusted input | Search text is normalised, stripped of symbols and capped at 80 characters; questions are capped at 300. Stored preferences are re-validated field by field on load. | `src/api/openMeteo.ts`, `src/assistant/intents.ts`, `src/state/preferences.ts` |
| Clickjacking and sniffing | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS and a restrictive `Permissions-Policy`. | `vercel.json` |
| Secrets | None. The app uses keyless public APIs, so there is nothing to leak. | |
| Privacy | Device location is rounded to two decimals (about 1 km) before it leaves the browser. Preferences stay in `localStorage` on the device. There are no analytics or third-party scripts. | `src/api/openMeteo.ts`, `src/app.ts` |
| Supply chain | Zero runtime dependencies. CI runs `npm audit`; Dependabot keeps dev tools and Actions current; the workflow token is read-only. | `package.json`, `.github/` |

`src/security.test.ts` checks that the CSP is identical in the build and the hosting headers, allows only the APIs
the code calls, and that `index.html` contains no inline scripts, handlers or styles.
