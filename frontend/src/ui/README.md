# Desktop UI Kit (`src/ui`)

Internal kit of presentational desktop components extracted from repeated page
patterns. Import from the barrel: `import { DesktopDataGrid } from '@/ui'`.

## Principles (kit rules)
- **No hollow wrappers** — a component exists only where a pattern was genuinely
  repeated or adds real desktop value. Plain Vuetify elements are used directly.
- **No business logic / no data fetching / no RBAC inside** — components take
  data + `disabled`/`loading` via props and emit events. Permission-awareness is
  expressed by the caller passing `disabled` (e.g. on a context-menu/selection
  action), never by importing the auth store here.
- **Typed props + slots**, **Light/Dark** (theme CSS vars), **RTL** (logical
  props / flex), **compact density**, **loading** and **disabled** support.
- **Gradual adoption** with a build between phases — never a wide sweep at once.

## Build vs Reuse vs Skip (the proposed list)

| Proposed | Decision | Implementation |
|---|---|---|
| DesktopPage | **build** | `DesktopPage.vue` — header (composes PageHeader) + content w/ loading/error |
| DesktopDataGrid | **build** | `DesktopDataGrid.vue` — v-data-table(+server) + skeleton/empty/compact |
| DesktopErrorState | **build** | `DesktopErrorState.vue` — renders an AppError (title/message/details/retry) |
| DesktopLoadingState | **build** | `DesktopLoadingState.vue` — centered spinner + label |
| DesktopSelectionBar | **build** | `DesktopSelectionBar.vue` — bulk-action bar (was hand-rolled in ~9 files) |
| DesktopContextMenu | **build** | `DesktopContextMenu.vue` — right-click menu (was missing) |
| DesktopPropertyList | **build** | `DesktopPropertyList.vue` — key/value detail grid (≈ DesktopPropertyPanel) |
| DesktopKeyboardShortcut | **build** | `DesktopKbd.vue` — shortcut chips |
| DesktopCommandBar | **reuse** | `@/shell/DesktopCommandBar.vue` |
| DesktopWorkspace | **reuse** | `@/shell/DesktopWorkspace.vue` |
| DesktopStatusBar | **reuse** | `@/shell/DesktopStatusBar.vue` |
| DesktopTabHost | **reuse** | `@/components/WorkspaceTabs.vue` (in-context tabs) |
| DesktopEmptyState | **reuse** | `@/components/EmptyState.vue` |
| DesktopConfirmDialog | **reuse** | `@/components/ConfirmDialog.vue` |
| DesktopSearchBox | **reuse** | `@/components/SearchBar.vue` |
| DesktopFilterBar | **reuse** | `@/components/FilterBar.vue` |
| DesktopFormSection | **reuse** | `@/components/FormSection.vue` |
| DesktopToolbar | **skip** | covered by `DesktopPage`'s `#toolbar` slot |
| DesktopDetailsPanel | **skip** | covered by `DesktopPage` + `DesktopPropertyList` + `DesktopTabHost` |
| DesktopTree | **skip** | only one consumer (GL chart of accounts) — no real repetition |
| DesktopSplitView | **skip (for now)** | no current master-detail screens; build when that lands |

## Adoption status
Gradual. First adoption: the customers reference feature
(`CustomerProfile` loading/error → `DesktopLoadingState`/`DesktopErrorState`).
Roll the rest out feature-by-feature, running `pnpm build` between steps.
