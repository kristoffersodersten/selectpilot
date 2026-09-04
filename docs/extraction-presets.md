# Extraction preset contract

The canonical preset registry is [`presets/extraction-presets.json`](../presets/extraction-presets.json). Edit that file, then run:

```bash
pnpm build
pnpm test
```

Build validates the registry and generates the browser module. The Python bridge reads the same JSON directly. Unknown explicit preset keys fail; only an omitted key uses `default_preset`.

Each preset requires:

- a unique `key`, user-facing `label`, and `description`;
- an `intro_key` present in the schema;
- deterministic instructions;
- a JSON Schema with `type: object`, `additionalProperties: false`, and every property listed in `required`;
- ordered `[field, heading]` pairs for Markdown rendering.

No preset may add network behavior, cloud fallback, retention, or an implicit schema default. A changed schema must include server and panel regression coverage and pass the real extension E2E/privacy gate.
