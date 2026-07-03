import { findTripByJoinCode } from "./trips.js";

/**
 * Normalizes a join code value.
 * @param {string} joinCode
 * @returns {string}
 */
export function normalizeJoinCode(joinCode) {
  return joinCode.trim().toUpperCase();
}

/**
 * Extracts a join code from a URL.
 * @param {string | URL} [inputUrl=window.location.href]
 * @returns {string | null}
 */
export function getJoinCodeFromUrl(inputUrl = window.location.href) {
  const url = new URL(inputUrl.toString(), window.location.origin);
  const joinCode = url.searchParams.get("joinCode");
  return joinCode ? normalizeJoinCode(joinCode) : null;
}

/**
 * Builds an invitation URL for a trip.
 * @param {string} joinCode
 * @param {string | URL} [baseUrl=window.location.href]
 * @returns {string}
 */
export function buildInviteUrl(joinCode, baseUrl = window.location.href) {
  const url = new URL(baseUrl.toString(), window.location.origin);
  url.searchParams.set("joinCode", normalizeJoinCode(joinCode));
  return url.toString();
}

/**
 * Builds a copy-ready invitation message.
 * @param {string} tripTitle
 * @param {string} joinCode
 * @param {string | URL} [baseUrl=window.location.href]
 * @returns {{text: string, url: string}}
 */
export function buildInviteMessage(tripTitle, joinCode, baseUrl = window.location.href) {
  const url = buildInviteUrl(joinCode, baseUrl);
  return {
    text: `Присоединяйся к поездке «${tripTitle}» по ссылке: ${url}`,
    url,
  };
}

/**
 * Resolves a trip from the current URL join code.
 * @param {Array<{id: string, joinCode?: string}>} trips
 * @param {string | URL} [inputUrl=window.location.href]
 * @returns {{trip: {id: string, joinCode?: string} | null, joinCode: string | null}}
 */
export function resolveTripFromInviteUrl(trips, inputUrl = window.location.href) {
  const joinCode = getJoinCodeFromUrl(inputUrl);
  if (!joinCode) {
    return { trip: null, joinCode: null };
  }

  return {
    trip: findTripByJoinCode(trips, joinCode),
    joinCode,
  };
}
