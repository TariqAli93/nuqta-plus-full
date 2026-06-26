/**
 * Desktop UI Kit — single import surface.
 *
 * NEW components (built because the pattern was genuinely repeated and not
 * already covered) live in this folder. Components that already existed are
 * re-exported here under their kit name so callers have ONE import surface —
 * they are NOT duplicated. See README.md for the full build-vs-reuse-vs-skip
 * map and the rationale per the kit rules.
 *
 *   import { DesktopDataGrid, DesktopErrorState } from '@/ui';
 */

// ── New kit components ──────────────────────────────────────────────────────
export { default as DesktopPage } from './DesktopPage.vue';
export { default as DesktopDataGrid } from './DesktopDataGrid.vue';
export { default as DesktopErrorState } from './DesktopErrorState.vue';
export { default as DesktopLoadingState } from './DesktopLoadingState.vue';
export { default as DesktopSelectionBar } from './DesktopSelectionBar.vue';
export { default as DesktopContextMenu } from './DesktopContextMenu.vue';
export { default as DesktopPropertyList } from './DesktopPropertyList.vue';
export { default as DesktopKbd } from './DesktopKbd.vue';
export { default as DesktopSplitView } from './DesktopSplitView.vue';

// ── Existing canonical components, surfaced under kit names (no duplication) ─
export { default as DesktopEmptyState } from '@/components/EmptyState.vue';
export { default as DesktopConfirmDialog } from '@/components/ConfirmDialog.vue';
export { default as DesktopSearchBox } from '@/components/SearchBar.vue';
export { default as DesktopFilterBar } from '@/components/FilterBar.vue';
export { default as DesktopFormSection } from '@/components/FormSection.vue';
export { default as DesktopTabHost } from '@/components/WorkspaceTabs.vue';
export { default as DesktopCommandBar } from '@/shell/DesktopCommandBar.vue';
export { default as DesktopWorkspace } from '@/shell/DesktopWorkspace.vue';
export { default as DesktopStatusBar } from '@/shell/DesktopStatusBar.vue';
