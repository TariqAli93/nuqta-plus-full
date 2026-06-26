/**
 * Navigation commands derived from the single nav registry.
 *
 * The command palette's "open module" entries are GENERATED from
 * {@link navigationRegistry} so a page is declared exactly once (the registry)
 * and never re-listed by hand in the catalog. Only `route` leaves become
 * commands; `report:` leaves stay as the explicit `reports.*` operation
 * commands, and the dashboard is already covered by `app.go-dashboard`.
 *
 * Permission gating is enforced by the command core (`cmd.permission`). Feature
 * / capability gating is applied via `visible(ctx)` using the `hasFeature` /
 * `can` helpers added to the command context in useCommands.js.
 *
 * Pure data — `execute` operates only through the injected CommandContext.
 * Imports the registry by RELATIVE path (with extension) so this module stays
 * resolvable under plain `node --test`, not only through the Vite `@/` alias.
 */
import { navigationRegistry } from '../shell/navigation/registry.js';

const isGroup = (item) => Array.isArray(item.children) && item.children.length > 0;

const flattenLeaves = (items, acc = []) => {
  for (const item of items) {
    if (isGroup(item)) flattenLeaves(item.children, acc);
    else acc.push(item);
  }
  return acc;
};

/** A registry leaf that opens an in-app route (excludes reports + the dashboard). */
const isNavigableLeaf = (leaf) => !!leaf.route && leaf.route !== '/' && !leaf.report;

/** Feature / capability gate (permission is enforced by the core via `permission`). */
const passesFlags = (leaf, ctx) => {
  if (leaf.feature && !ctx.hasFeature?.(leaf.feature)) return false;
  if (
    Array.isArray(leaf.anyFeature) &&
    leaf.anyFeature.length > 0 &&
    !leaf.anyFeature.some((f) => ctx.hasFeature?.(f))
  ) {
    return false;
  }
  if (leaf.capability && !ctx.can?.(leaf.capability)) return false;
  return true;
};

/** Build the derived "open module" commands from a registry tree. */
export function buildNavCommands(registry = navigationRegistry) {
  return flattenLeaves(registry)
    .filter(isNavigableLeaf)
    .map((leaf) => ({
      id: `nav.${leaf.id}`,
      title: `فتح ${leaf.label}`,
      icon: leaf.icon,
      group: 'Navigation',
      keywords: [...(leaf.keywords || []), leaf.label],
      ...(leaf.permission ? { permission: leaf.permission } : {}),
      visible: (ctx) => passesFlags(leaf, ctx),
      execute: (ctx) => ctx.app.navigate({ path: leaf.route }),
    }));
}

/** @type {import('./core.js').AppCommand[]} */
export const navCommandsFromRegistry = buildNavCommands();
