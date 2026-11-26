import './styles.css';
import { createOpenMeteoClient } from './api/openMeteo';
import { startApp } from './app';

/** Storage access throws in some privacy modes, so it is optional. */
function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

startApp(document, {
  client: createOpenMeteoClient(),
  storage: localStorageOrNull(),
  geolocation: 'geolocation' in navigator ? navigator.geolocation : null,
  locale: navigator.language,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
