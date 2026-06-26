/**
 * Command navigation target — the unified description of "where + what" a
 * command does. Pure (no Vue/router), so it's unit-testable.
 *
 * @typedef {Object} CommandNavigationTarget
 * @property {string}  [routeName]  Named route to push.
 * @property {string}  [path]       Path to push (alternative to routeName).
 * @property {Object}  [params]     Route params.
 * @property {Object}  [query]      Extra query params.
 * @property {string}  [tab]        Internal tab id → becomes `query.tab` (the
 *                                  page activates it via a `route.query.tab`
 *                                  watcher — never a numeric index).
 * @property {string}  [panel]      Internal panel id → `query.panel`.
 * @property {string}  [hash]       Hash anchor.
 * @property {string}  [action]     Page-action id to run AFTER the page is
 *                                  ready (via the Page Action Registry).
 * @property {*}       [payload]    Payload passed to the page action.
 * @property {string}  [moduleKey]  Override the page-action registry key
 *                                  (defaults to the route name, lowercased).
 */

/** Build a vue-router location object from a target. Tab/panel become query. */
export function buildRouteLocation(target) {
  const loc = {};
  if (target.routeName) loc.name = target.routeName;
  else if (target.path) loc.path = target.path;

  if (target.params && Object.keys(target.params).length) loc.params = { ...target.params };

  const query = { ...(target.query || {}) };
  if (target.tab) query.tab = target.tab;
  if (target.panel) query.panel = target.panel;
  if (Object.keys(query).length) loc.query = query;

  if (target.hash) loc.hash = target.hash.startsWith('#') ? target.hash : `#${target.hash}`;
  return loc;
}

/** The Page Action Registry key a target resolves to (route name, lowercased). */
export function moduleKeyForTarget(target) {
  if (target.moduleKey) return String(target.moduleKey).toLowerCase();
  if (target.routeName) return String(target.routeName).toLowerCase();
  if (target.path) {
    return String(target.path).replace(/^\//, '').split('/')[0].toLowerCase();
  }
  return '';
}
