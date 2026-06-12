import featureFlagsService, { SETUP_PRESETS, APP_MODES } from '../services/featureFlagsService.js';
import auditService from '../services/auditService.js';
import settingsService from '../services/settingsService.js';
import coaTemplateService from '../services/gl/coaTemplateService.js';
import { ValidationError } from '../utils/errors.js';

/**
 * Chart-of-accounts template choices made in the full-mode setup wizard:
 *   - 'simple_tree' / 'iraqi_unified' → actually seed that template's accounts
 *     (idempotent — never duplicates on re-run),
 *   - 'manual' → seed nothing; the operator builds the tree from the COA screen.
 * The choice is also stored as a plain setting so the upgrade flow can read it.
 */
const COA_TEMPLATES = new Set(['simple_tree', 'iraqi_unified', 'manual']);

export class FeatureFlagsController {
  async get(request, reply) {
    const [flags, setupMode, appMode] = await Promise.all([
      featureFlagsService.getFeatureFlags(),
      featureFlagsService.getSetupMode(),
      featureFlagsService.getAppMode(),
    ]);
    return reply.send({ success: true, data: { flags, setupMode, appMode } });
  }

  async update(request, reply) {
    const next = await featureFlagsService.updateFeatureFlags(
      request.body || {},
      request.user?.id
    );

    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'settings:feature_flags_updated',
      resource: 'settings',
      details: next,
    });

    return reply.send({ success: true, data: next, message: 'Feature flags updated' });
  }

  async applySetupPreset(request, reply) {
    const preset = request.body?.preset;
    if (!preset || !SETUP_PRESETS[preset]) {
      throw new ValidationError(
        `preset is required — one of: ${Object.keys(SETUP_PRESETS).join(' | ')}`
      );
    }

    const coaTemplate = request.body?.coaTemplate;
    if (coaTemplate !== undefined && !COA_TEMPLATES.has(coaTemplate)) {
      throw new ValidationError('coaTemplate must be one of: simple_tree | iraqi_unified | manual');
    }

    const flags = await featureFlagsService.applySetupPreset(preset, request.user?.id);
    const appMode = await featureFlagsService.getAppMode();

    // Persist the choice, then actually build the chart of accounts. Seeding is
    // idempotent (existing codes are skipped) so re-running setup never creates
    // duplicates. 'manual' (or no template) seeds nothing. Only seed once the
    // general ledger is on — otherwise the accounts would have no home.
    let coaSeed = null;
    if (coaTemplate) {
      await settingsService.upsert({
        key: 'coa_template',
        value: coaTemplate,
        description: 'Chart of accounts template chosen at setup/upgrade',
      });
      if (coaTemplate !== 'manual' && flags?.generalLedger) {
        coaSeed = await coaTemplateService.seed(coaTemplate, request.user?.id);
      }
    }

    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'settings:setup_wizard_applied',
      resource: 'settings',
      details: { preset, appMode, coaTemplate: coaTemplate || null, coaSeed, flags },
    });

    return reply.send({
      success: true,
      data: { flags, appMode, coaTemplate: coaTemplate || null, coaSeed },
      message: 'Setup preset applied',
    });
  }

  /**
   * Switch the operating mode in EITHER direction (simple ⇄ full). Upgrading to
   * full only unlocks the modules (flags stay as they are). Downgrading to
   * simple hides the advanced suite (full-only flags off) WITHOUT deleting any
   * data — see featureFlagsService.setAppMode.
   */
  async setAppMode(request, reply) {
    const mode = request.body?.mode;
    if (mode !== APP_MODES.SIMPLE && mode !== APP_MODES.FULL) {
      throw new ValidationError('mode is required — one of: simple | full');
    }

    const appMode = await featureFlagsService.setAppMode(mode, request.user?.id);

    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'settings:app_mode_changed',
      resource: 'settings',
      details: { appMode },
    });

    return reply.send({ success: true, data: { appMode }, message: 'App mode updated' });
  }
}
