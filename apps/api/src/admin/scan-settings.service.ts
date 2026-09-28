import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { getConfig, type AppConfig } from '@sap/config';
import {
  ScanSettingsRepository,
  type ScanSettingsPatch,
  type ScanSettingsView,
} from './scan-settings.repository.js';

/**
 * Reads and updates the hybrid scan detection settings. Enabling the vision LLM
 * is rejected unless the SAPA gateway is configured, so an admin cannot switch on
 * a path that would only ever fall back to ML.
 */
@Injectable()
export class ScanSettingsService {
  private readonly config: AppConfig = getConfig();

  constructor(private readonly repo: ScanSettingsRepository) {}

  getScanSettings(): Promise<ScanSettingsView> {
    return this.repo.get();
  }

  updateScanSettings(
    actorId: string,
    requestId: string | null,
    patch: ScanSettingsPatch,
  ): Promise<ScanSettingsView> {
    const wantsVision = patch.visionEnabled === true || patch.mode === 'full_llm';
    if (wantsVision && (!this.config.SAPA_LLM_BASE_URL || !this.config.SAPA_LLM_API_KEY)) {
      throw new UnprocessableEntityException({
        code: 'SCAN_SETTINGS_INVALID',
        message: 'Vision LLM belum dikonfigurasi (SAPA_LLM_BASE_URL / SAPA_LLM_API_KEY).',
      });
    }
    return this.repo.update(actorId, requestId, patch);
  }
}
