export type KnowledgeTarget = 'generic' | 'notion' | 'craft' | 'obsidian';

export type MemoryLedgerEntry = {
  action: 'extract' | 'summarize' | 'agent';
  content?: string;
  summary?: string;
  url?: string;
  title?: string;
  sourceType?: 'web' | 'pdf' | 'text';
  sourceOrigin?: string;
  sourceTimestamp?: string;
  intent?: 'note' | 'insight' | 'task' | 'reference';
  tags?: string[];
  charCount: number;
  createdAt: number;
};

type CanonicalEntry = {
  id: string;
  action: MemoryLedgerEntry['action'];
  title: string;
  content: string;
  summary: string;
  source: {
    url: string | null;
    origin: string;
    type: 'web' | 'pdf' | 'text';
    captured_at: string;
    source_timestamp: string | null;
  };
  metadata: {
    intent: NonNullable<MemoryLedgerEntry['intent']>;
    tags: string[];
    char_count: number;
  };
};

function normalizeTitle(entry: MemoryLedgerEntry, index: number): string {
  return entry.title?.trim() || `Captured item ${index + 1}`;
}

function isoFromEpoch(epoch: number): string {
  return new Date(epoch).toISOString();
}

function normalizeIntent(entry: MemoryLedgerEntry): NonNullable<MemoryLedgerEntry['intent']> {
  if (entry.intent) return entry.intent;
  if (entry.action === 'extract') return 'task';
  if (entry.action === 'agent') return 'insight';
  return 'reference';
}

function normalizeSourceType(entry: MemoryLedgerEntry): 'web' | 'pdf' | 'text' {
  if (entry.sourceType) return entry.sourceType;
  if (!entry.url) return 'text';
  return entry.url.toLowerCase().includes('.pdf') ? 'pdf' : 'web';
}

function normalizeContent(entry: MemoryLedgerEntry): string {
  return (entry.content || '').trim();
}

function normalizeSummary(entry: MemoryLedgerEntry): string {
  const summary = (entry.summary || '').trim();
  if (summary) return summary;
  return normalizeContent(entry).slice(0, 280);
}

function toCanonicalEntries(entries: MemoryLedgerEntry[]): CanonicalEntry[] {
  return entries.map((entry, index) => {
    const capturedAt = isoFromEpoch(entry.createdAt);
    const sourceTimestamp = entry.sourceTimestamp?.trim() || null;
    return {
      id: `entry-${entry.createdAt}-${index + 1}`,
      action: entry.action,
      title: normalizeTitle(entry, index),
      content: normalizeContent(entry),
      summary: normalizeSummary(entry),
      source: {
        url: entry.url || null,
        origin: entry.sourceOrigin?.trim() || entry.url || 'local-context',
        type: normalizeSourceType(entry),
        captured_at: capturedAt,
        source_timestamp: sourceTimestamp,
      },
      metadata: {
        intent: normalizeIntent(entry),
        tags: Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [],
        char_count: entry.charCount,
      },
    };
  });
}

export function buildKnowledgePackage(target: KnowledgeTarget, entries: MemoryLedgerEntry[]) {
  const generatedAt = new Date().toISOString();
  const canonical = toCanonicalEntries(entries);

  if (target === 'notion') {
    return {
      schema_version: '1.0',
      target,
      generated_at: generatedAt,
      canonical_entries: canonical,
      database: {
        title: 'SelectPilot Knowledge Export',
        properties: ['Name', 'Summary', 'Action', 'Intent', 'Tags', 'Source URL', 'Source Type', 'Captured At', 'Character Count'],
      },
      rows: canonical.map((item) => ({
        Name: item.title,
        Summary: item.summary,
        Action: item.action,
        Intent: item.metadata.intent,
        Tags: item.metadata.tags.join(', '),
        'Source URL': item.source.url,
        'Source Type': item.source.type,
        'Captured At': item.source.captured_at,
        'Character Count': item.metadata.char_count,
      })),
    };
  }

  if (target === 'craft') {
    return {
      schema_version: '1.0',
      target,
      generated_at: generatedAt,
      canonical_entries: canonical,
      collection: {
        name: 'SelectPilot Knowledge Export',
        blocks: canonical.map((item) => ({
          type: 'entry',
          id: item.id,
          title: item.title,
          summary: item.summary,
          content: item.content,
          metadata: {
            action: item.action,
            intent: item.metadata.intent,
            tags: item.metadata.tags,
            source_url: item.source.url,
            source_type: item.source.type,
            source_origin: item.source.origin,
            captured_at: item.source.captured_at,
            source_timestamp: item.source.source_timestamp,
            char_count: item.metadata.char_count,
          },
        })),
      },
    };
  }

  if (target === 'obsidian') {
    return {
      schema_version: '1.0',
      target,
      generated_at: generatedAt,
      canonical_entries: canonical,
      vault_pack: {
        folder: 'SelectPilot Knowledge',
        notes: canonical.map((item) => ({
          filename: `${item.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'captured-item'}.md`,
          frontmatter: {
            id: item.id,
            action: item.action,
            intent: item.metadata.intent,
            tags: item.metadata.tags,
            source_url: item.source.url,
            source_type: item.source.type,
            source_origin: item.source.origin,
            source_timestamp: item.source.source_timestamp,
            captured_at: item.source.captured_at,
            char_count: item.metadata.char_count,
          },
          body: `# ${item.title}\n\n## Summary\n${item.summary || '_No summary available._'}\n\n## Content\n${item.content || '_No content retained._'}\n\n## Metadata\n- Action: ${item.action}\n- Intent: ${item.metadata.intent}\n- Tags: ${item.metadata.tags.join(', ') || 'n/a'}\n- Source: ${item.source.url || 'n/a'}\n- Source type: ${item.source.type}\n- Captured: ${item.source.captured_at}\n- Character count: ${item.metadata.char_count}`,
        })),
      },
    };
  }

  return {
    schema_version: '1.0',
    target: 'generic',
    generated_at: generatedAt,
    entries: canonical,
  };
}
