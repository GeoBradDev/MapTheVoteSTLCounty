// Translation for every string the site shows (#19). The messages live in
// src/i18n/<locale>.json; the copy modules next to each feature read them
// through t() and keep the shape the components use. English is bundled, as
// it renders first; any other language loads only when chosen.
import { useSyncExternalStore } from 'react';
import { DEFAULT_LOCALE, LOCALES, TIME_ZONE } from './config.js';
import en from './en.json' with { type: 'json' };
import { formatMessage } from './format.js';

// Every other <locale>.json, loaded on demand. Vite fills this in; plain Node
// (the Playwright specs import copy modules) has no import.meta.glob, and gets
// English only.
let loaders = {};
try {
  loaders = import.meta.glob(['./*.json', '!./en.json'], { import: 'default' });
} catch {
  // Not built by Vite.
}

/** @type {Record<string, object>} */
const catalogs = { [DEFAULT_LOCALE]: en };
let current = DEFAULT_LOCALE;
const listeners = new Set();

const lookup = (messages, key) =>
  key
    .split('.')
    .reduce((node, part) => (node && Object.hasOwn(node, part) ? node[part] : undefined), messages);

/**
 * A t() bound to one locale: the message for `key` in that locale, else in
 * English, else the key itself, with `params` filled in.
 * @param {string} locale
 * @returns {(key: string, params?: Record<string, unknown>) => string}
 */
export function tFor(locale) {
  return (key, params) => {
    const own = lookup(catalogs[locale], key);
    if (typeof own === 'string') return formatMessage(own, params, intlLocale(locale));
    const fallback = lookup(catalogs[DEFAULT_LOCALE], key);
    if (typeof fallback === 'string') {
      return formatMessage(fallback, params, LOCALES[DEFAULT_LOCALE].intl);
    }
    return key;
  };
}

/**
 * The message for `key` in the current locale, with `params` filled in.
 * @param {string} key Dotted path into the locale's JSON, such as `home.heading`.
 * @param {Record<string, unknown>} [params]
 */
export function t(key, params) {
  return tFor(current)(key, params);
}

/** The current locale's code, such as `en`. */
export function getLocale() {
  return current;
}

/** Whether `locale` is configured and its messages are loaded. */
export function isLoaded(locale) {
  return Object.hasOwn(LOCALES, locale) && Object.hasOwn(catalogs, locale);
}

/** The BCP 47 tag Intl formats `locale` with. */
export function intlLocale(locale = current) {
  return LOCALES[locale]?.intl ?? LOCALES[DEFAULT_LOCALE].intl;
}

/**
 * Switches the site to `locale`, loading its messages first, and sets
 * <html lang> to match.
 * @param {string} locale A key of LOCALES.
 */
export async function setLocale(locale) {
  if (!Object.hasOwn(LOCALES, locale)) throw new Error(`Unknown locale: ${locale}`);
  if (!Object.hasOwn(catalogs, locale)) {
    const load = loaders[`./${locale}.json`];
    if (!load) throw new Error(`No messages for locale: ${locale}`);
    catalogs[locale] = await load();
  }
  current = locale;
  document.documentElement.lang = locale;
  for (const listener of listeners) listener();
}

/**
 * Adds a locale's messages without a file. For tests, which stand in for a
 * second language.
 * @param {string} locale
 * @param {object} messages
 */
export function addMessages(locale, messages) {
  catalogs[locale] = messages;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current locale, re-rendering the caller when it changes. */
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/**
 * A copy object whose strings come from t(): `build` gets a t() bound to the
 * current locale and returns the object. The object is built on first use in
 * each locale and kept, so it is the same object until the locale changes.
 * @template T
 * @param {(t: ReturnType<typeof tFor>) => T} build
 * @returns {T}
 */
export function translated(build) {
  const built = new Map();
  const forLocale = () => {
    if (!built.has(current)) built.set(current, build(tFor(current)));
    return built.get(current);
  };
  return new Proxy(
    {},
    {
      get: (_, prop) => forLocale()[prop],
      has: (_, prop) => prop in forLocale(),
      ownKeys: () => Reflect.ownKeys(forLocale()),
      getOwnPropertyDescriptor: (_, prop) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(forLocale(), prop);
        return descriptor && { ...descriptor, configurable: true };
      },
    },
  );
}

const dateFormats = new Map();

/**
 * A date as `Intl.DateTimeFormat` formats it in the current locale (or
 * `locale`), in the election's time zone unless `options.timeZone` says
 * otherwise.
 * @param {Date | number} date
 * @param {Intl.DateTimeFormatOptions} options
 * @param {string} [locale]
 */
export function formatDate(date, options, locale = current) {
  const resolved = { timeZone: TIME_ZONE, ...options };
  const key = `${intlLocale(locale)}|${JSON.stringify(resolved)}`;
  if (!dateFormats.has(key))
    dateFormats.set(key, new Intl.DateTimeFormat(intlLocale(locale), resolved));
  return dateFormats.get(key).format(date);
}

/**
 * A calendar date, YYYY-MM-DD, formatted like formatDate. It is read at noon
 * UTC, which is the same calendar day in the election's time zone, so the day
 * never shifts.
 * @param {string} isoDate
 * @param {Intl.DateTimeFormatOptions} options
 * @param {string} [locale]
 */
export function formatCalendarDate(isoDate, options, locale = current) {
  return formatDate(new Date(`${isoDate}T12:00:00Z`), options, locale);
}
