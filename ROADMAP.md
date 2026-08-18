# SelectPilot — Prioriterad åtgärdslista

> Harmoniserad med repo-läget per 2026-03-25 (granskning av `manifest.json`, `package.json`, `README.md`, teststruktur och `ZERO_LEAKAGE.md`).
> Prioritering: **P0** = blockerar trust/release · **P1** = produktkvalitet · **P2** = strategisk moat

---

## P0 — Kritiska fel och inkonsekvenser

### 1) Versionsdrift mellan `package.json` och `manifest.json`

- **Status:** ✅ Löst.
- **Implementerat:** `pnpm build` kör nu `sync:manifest-version` som injekterar version från `package.json` till `manifest.json`.

### 2) Dubbla lock-filer (`pnpm-lock.yaml` + `package-lock.json`)

- **Status:** ✅ Löst.
- **Implementerat:**
  - `package-lock.json` borttagen
  - `.npmrc` tillagd med `engine-strict=true`
  - `.gitignore` uppdaterad med `package-lock.json`
  - CI kör pnpm-only

### 3) Manifest-fält med tomma strängar i `matches`

- **Status:** ✅ Löst (`<all_urls>` används i relevanta `matches`-fält).
- **Implementerat:** CI innehåller nu `pnpm lint:manifest` för regressionsskydd av manifest-fält.

---

## P1 — Produktkvalitet och onboarding

### 4) Onboarding-friktion är för hög

- **Status:** ✅ Löst för det lokala macOS-flödet.
- **Implementerat:** `pnpm setup:local` bygger extensionen, installerar/startar Ollama vid behov, väljer hårdvaruprofil, hämtar exakta modeller, installerar LaunchAgent och failar om exakt bridge-/modellhälsa inte kan verifieras.

### 5) Nginx/hosts-topologi bör vara osynlig

- **Status:** ✅ I huvudsak löst i huvudflödet (direkt mot `127.0.0.1:8083`; nginx markerat som legacy).
- **Åtgärd kvar:** behåll detta som policy i dokumentation och scripts.

### 6) README saknar tydligt 5-minutersflöde högst upp

- **Status:** ✅ Löst.
- **Implementerat:** trestegs Quick Start tidigt i README, ett enda setup-kommando och copy/paste-diagnostik utan dold fallback.

### 7) Inga end-to-end-tester för extension-flödet

- **Status:** ✅ Löst för det primära selected-text-flödet.
- **Implementerat:** Playwright-konfiguration och E2E-suite för runtime/privacy + mockad selected-text response shape.
- **Implementerat nu även:** harness-baserat sidepanel E2E-flöde som verifierar privacy-indikator + lokal fetch-trafik i panelens användarflöde.
- **Implementerat:** riktig unpacked-extension-path med injicerat content script: markera text på webbsida → background/context → sidepanel-action → renderat svar, utan harness.

---

## P1 — Privacy boundary integrity

### 8) Inga automatiska regressionstester för privacy boundary

- **Status:** ✅ Löst för kärnflödet.
- **Implementerat:**
  - servertest för privacy proof (`tests/server/test_privacy_proof.py`)
  - Playwright-test som verifierar local-only privacy proof och local endpoints
  - Playwright-test (`tests/e2e/panel-no-leakage.spec.mjs`) som assertar lokal fetch-trafik + subtil visuell privacy proof i panel-harness
- **Implementerat:** full-extension-testet registrerar all HTTP(S)-trafik under kärnoperationen och kräver noll externa anrop.

### 9) Privacy-påstående är inte synligt verifierbart för ny användare

- **Status:** ✅ Löst.
- **Implementerat:** `/privacy-proof` endpoint i lokal server + synlig `Privacy`-indikator i sidepanelens truth strip.

---

## P2 — Strategisk produktmoat

### 10) Generisk copilot-retorik underminerar edge

- **Status:** 🟡 Delvis adresserat.
- **Åtgärd kvar:** skärp positioning till structured extraction + local privacy i README/UI copy.

### 11) Presets är inte tillräckligt synliga eller utbyggbara

- **Status:** 🟡 Delvis (preset-funktionalitet finns, men tydligt användar-API saknas).
- **Åtgärd kvar:** exponera presets i redigerbar JSON/YAML + dokumentera format.

### 12) Ingen tydlig upgrade-path till team/self-hosted mode

- **Status:** 🟡 Planerad men ej konkretiserad.
- **Implementerat nu:** README förtydligar tier-guardrails där Essential/Plus hålls stateless i core-flödet och Pro definieras som explicit opt-in stateful lager.
- **Åtgärd kvar:** lägg kort sektion i README om Team/Self-hosted mode och avgränsa vad som är planerat.

### 13) Tier-packaging och pricing-integritet behöver löpande styrning

- **Status:** 🟡 Delvis adresserat.
- **Implementerat:** README innehåller nu explicit tier-prissättning, Paddle-mappning, positioneringsvarianter och realistisk ARR-prognos.
- **Åtgärd kvar:**
  - säkra att Pro kontinuerligt får tydlig premium-differentiering mot Plus
  - håll fast vid arkitekturkontraktet: stateless core i Essential/Plus, stateful funktioner endast via explicit opt-in i Pro
  - gör retention alltid synlig och användarstyrd (inspect/export/delete) när stateful läge används
  - koppla release notes till tier-mervärde per version (Essential/Plus/Pro)
  - lägga in uppföljning på konvertering mellan tiers som produkt-KPI

---

## Prioriterad genomförandeordning (från nu)

### Nästa sprint (måste först)

1. Verifiera one-command onboarding och verklig Ollama-inferens på namngiven Apple Silicon-målmaskin.
2. Samla långinput-, minnes- och latensevidens för Fast/Balanced innan slutlig modellpromotion.

### Strategisk polish

9. **P2.10** Positioning-copy: structured outputs + local-first
10. **P2.11** Utbyggbara presets (JSON/YAML + docs)
11. **P2.12** Team/Self-hosted mode i README
12. **P2.13** Tier-differentiering och pricing-integritet (särskilt Pro-value)

---

## Finish line (kvalitetskrav innan "klart")

> Målnivå: **"Jonathan Ive-nivå" polish** + **installation enkel nog för en 89-åring**.

### 1) One-command installation (absolut först)

- **Mål:** användaren ska klara onboarding med en enda kommando-rad.
- **Status:** Implementerat och kontraktstestat; verklig målmaskinsverifiering återstår.

### 2) "89-åring-läge" i README (ultrakort onboarding)

- **Mål:** inga tekniska beslut i första flödet.
- **Status:** Trestegsflöde och copy/paste-diagnostik implementerade; användbarhetsvalidering på ren målmaskin återstår.

### 3) UI/UX-polish till premium-kvalitet

- **Mål:** konsekvent, självförklarande och visuellt lugn panel/popup.
- **Kvar att leverera:**
  - enhetlig copy-ton och statusord i panel/popup
  - finjustera spacing/typografi i truth strip och runtime-indikatorer
  - säkra att knappar/labels är omedelbart begripliga vid första användning

### 4) E2E-bevis för verkligt användarflöde

- **Mål:** kunna verifiera funktion och privacy med reproducerbara tester.
- **Status:** ✅ Implementerat: deterministisk serverlivscykel, full extension-path och strikt extern nätverksassert.

### 5) Strategisk finish (efter kvalitet + onboarding)

- **Kvar att leverera:**
  - skärpt positioning-copy (structured extraction + local-first)
  - presets som redigerbar JSON/YAML med dokumenterat schema
  - tydlig Team/Self-hosted-sektion och migration path

---

## Snabbreferens — Prioritetsmatris

| #  | Område                     | Prioritet | Status  | Effort |
|----|----------------------------|-----------|---------|--------|
| 1  | Versionsdrift              | P0        | Löst    | Låg    |
| 2  | Dubbla lock-filer          | P0        | Löst    | Låg    |
| 3  | Ogiltiga manifest-fält     | P0        | Löst    | Låg    |
| 4  | Onboarding-friktion        | P1        | Löst*   | Hög    |
| 5  | Nginx/hosts osynlighet     | P1        | Löst*   | Hög    |
| 6  | README Quick Start         | P1        | Löst    | Låg    |
| 7  | E2E-tester extension       | P1        | Löst    | Medium |
| 8  | Privacy regressionstester  | P1        | Löst    | Medium |
| 9  | Verifierbar privacy-yta    | P1        | Löst    | Medium |
| 10 | Omformulera positioning    | P2        | Delvis  | Låg    |
| 11 | Utbyggbara presets         | P2        | Delvis  | Medium |
| 12 | Team/self-hosted-path      | P2        | Delvis  | Låg    |
| 13 | Tier/pricing-integritet    | P2        | Delvis  | Medium |

\* Kod- och kontraktsnivå är löst; verklig ren målmaskinsverifiering återstår före fullsystems-DoD.

---

*Senast uppdaterad: 2026-03-25*
