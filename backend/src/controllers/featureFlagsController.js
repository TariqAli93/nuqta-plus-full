import featureFlagsService, { SETUP_PRESETS, APP_MODES } from '../services/featureFlagsService.js';
import auditService from '../services/auditService.js';
import settingsService from '../services/settingsService.js';
import { ValidationError } from '../utils/errors.js';

/**
 * Chart-of-accounts template choices (Phase D seeds from this preference).
 * Stored as a plain setting so the upgrade/setup flow can read it later.
 */
const COA_TEMPLATES = new Set(['simple_tree', 'iraqi_unified']);

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
      throw new ValidationError('coaTemplate must be one of: simple_tree | iraqi_unified');
    }

    const flags = await featureFlagsService.applySetupPreset(preset, request.user?.id);
    const appMode = await featureFlagsService.getAppMode();

    if (coaTemplate) {
      await settingsService.upsert({
        key: 'coa_template',
        value: coaTemplate,
        description: 'Chart of accounts template chosen at setup/upgrade',
      });
    }

    await auditService.log({
      userId: request.user?.id,
      username: request.user?.username,
      action: 'settings:setup_wizard_applied',
      resource: 'settings',
      details: { preset, appMode, coaTemplate: coaTemplate || null, flags },
    });

    return reply.send({
      success: true,
      data: { flags, appMode },
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
