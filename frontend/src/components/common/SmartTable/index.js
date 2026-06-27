/**
 * SmartTable — the app's unified, Fluent-styled desktop table system.
 *
 * Pages import the orchestrator (and, when needed, the formatters / column
 * helpers) from one place:
 *
 *   import SmartTable from '@/components/common/SmartTable';
 *   import { cellFormatters } from '@/components/common/SmartTable';
 */
export { default } from './SmartTable.vue';
export { default as SmartTable } from './SmartTable.vue';
export { default as SmartTableToolbar } from './SmartTableToolbar.vue';
export { default as SmartTableColumnManager } from './SmartTableColumnManager.vue';
export { default as SmartTableFilters } from './SmartTableFilters.vue';
export { default as SmartTableExportMenu } from './SmartTableExportMenu.vue';
export { default as SmartTablePrintView } from './SmartTablePrintView.vue';
export { default as SmartTableSidePanel } from './SmartTableSidePanel.vue';
export { default as SmartTableBulkActions } from './SmartTableBulkActions.vue';
export { default as SmartTableSavedViews } from './SmartTableSavedViews.vue';

export { useSmartTable } from './useSmartTable.js';
export { useSmartTableExport, exportFilename } from './useSmartTableExport.js';
export * from './formatters.js';
