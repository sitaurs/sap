import { Injectable } from '@nestjs/common';
import { GamificationService } from '../gamification/gamification.service.js';
import type { StatsView } from '../gamification/gamification.types.js';
import {
  CITATION_SNIPPET_MAX,
  CITATION_SOURCE_MAX,
  CITATION_TITLE_MAX,
  type Citation,
  type SuggestedAction,
} from './assistant.types.js';

/** Structured result of the deterministic get_my_stats tool. */
export interface StatsToolResult {
  reply: string;
  suggestedActions: SuggestedAction[];
  citations: Citation[];
}

/** Metric nouns that unambiguously ask about the caller's own numbers. */
const METRIC_RE = /\b(poin|poinku|skor|statistik|stat|streak|runtun|ecopoint)\b/;
/** "how many … <activity>" and "<activity> … how many" quantity questions. */
const QUANTITY_RE =
  /(berapa|jumlah|total|banyak)[\s\S]{0,24}(scan|pindai|poin|laporan|lencana|badge)|(scan|pindai|laporan)[\s\S]{0,24}(berapa|jumlah|total|banyak)/;

/**
 * The single read-only SAPA tool (Step 4 pilot). It answers "how many scans /
 * how many points / what's my streak" style questions from the caller's OWN
 * gamification aggregates.
 *
 * It is DELIBERATELY deterministic and never routed through the LLM: the locked
 * system prompt forbids the model from reciting any number that is not in the
 * KONTEKS block, so the service short-circuits here and composes the reply from
 * {@link GamificationService.getStats} directly. The account is always the
 * server-authenticated caller — never an argument the model can supply — so SAPA
 * cannot be steered to read another user's data. No PII (name, email, coords) is
 * ever included; only aggregate counts.
 */
@Injectable()
export class AssistantStatsTool {
  constructor(private readonly gamification: GamificationService) {}

  /** True when the message is clearly asking for the caller's own stats. */
  detectIntent(message: string): boolean {
    const text = message.toLowerCase();
    return METRIC_RE.test(text) || QUANTITY_RE.test(text);
  }

  /** Compose the deterministic stats reply + citation card for `userId`. */
  async run(userId: string, now: number = Date.now()): Promise<StatsToolResult> {
    const stats = await this.gamification.getStats(userId, now);
    return {
      reply: this.composeReply(stats),
      suggestedActions: [
        { label: 'Pencapaian', target: 'achievements' },
        { label: 'Bantuan', target: 'help' },
      ],
      citations: [
        {
          id: 'stats-akun',
          title: 'Statistik akunmu'.slice(0, CITATION_TITLE_MAX),
          snippet:
            'Angka ini dihitung langsung dari aktivitas akunmu (scan, poin, runtun, dan laporan), bukan dari perkiraan.'.slice(
              0,
              CITATION_SNIPPET_MAX,
            ),
          source: 'Data akun SAP'.slice(0, CITATION_SOURCE_MAX),
          url: null,
        },
      ],
    };
  }

  private composeReply(stats: StatsView): string {
    const lines = [
      'Berikut ringkasan aktivitasmu di SAP:',
      `- Scan total: ${stats.totalScans} (dikenali kategori: ${stats.classifiedScans})`,
      `- Poin: ${stats.ecoPoints}`,
      `- Runtun harian: ${stats.streakDays} hari`,
      `- Laporan terverifikasi: ${stats.verifiedReports}, selesai: ${stats.resolvedReports}`,
    ];
    const topCategories = stats.categoryCounts.slice(0, 3);
    if (topCategories.length > 0) {
      const parts = topCategories.map((row) => `${row.categoryId}: ${row.count}`).join(', ');
      lines.push(`- Kategori terbanyak: ${parts}`);
    }
    lines.push('Untuk nilai dan ambang poin yang pasti, lihat halaman Bantuan.');
    return lines.join('\n');
  }
}
