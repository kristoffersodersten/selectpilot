# SelectPilot — Prioriterad åtgärdslista

> Harmoniserad med repo-, GitHub- och Linear-läget per 2026-08-18.
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

- **Status:** ✅ Implementerat fail-closed; fysisk målmaskinsverifiering kvar.
- **Implementerat:** one-command bootstrap installerar/bygger, startar Ollama och bridge, väljer hårdvaruprofil, hämtar exakta modeller och avslutar först när generation- och embeddingkontrakten är friska.

### 5) Nginx/hosts-topologi bör vara osynlig

- **Status:** ✅ Implementerat i huvudflödet (direkt mot `127.0.0.1:8083`).
- **Implementerat:** den oanvända legacy-nginx-konfigurationen är borttagen så att ingen separat proxy- eller dynamisk CORS-yta kan aktiveras av misstag.

### 6) README saknar tydligt 5-minutersflöde högst upp

- **Status:** ✅ Löst i kod och dokumentation.
- **Implementerat:** README har ett trestegs **Quick Start (5 min)** och bootstrap verifierar bridge, exakt generationmodell och embeddingmodell fail-closed.
- **Verifiering kvar:** kör flödet på avsedd slutanvändarmaskin innan full-system-DoD.

### 7) Inga end-to-end-tester för extension-flödet

- **Status:** ✅ Löst.
- **Implementerat:** Playwright laddar den riktiga unpacked extensionen och verifierar markerad text → content script → background → sidepanel action → renderat svar.

---

## P1 — Privacy boundary integrity

### 8) Inga automatiska regressionstester för privacy boundary

- **Status:** ✅ Löst för det automatiserade core-flödet.
- **Implementerat:**
  - servertest för privacy proof (`tests/server/test_privacy_proof.py`)
  - Playwright-test som verifierar local-only privacy proof och local endpoints
  - Playwright-test (`tests/e2e/panel-no-leakage.spec.mjs`) som assertar lokal fetch-trafik + subtil visuell privacy proof i panel-harness
  - full-extension-test som failar vid extern HTTP(S)-trafik under core-flödet

### 9) Privacy-påstående är inte synligt verifierbart för ny användare

- **Status:** ✅ Löst.
- **Implementerat:** `/privacy-proof` endpoint i lokal server + synlig `Privacy`-indikator i sidepanelens truth strip.

---

## P2 — Strategisk produktmoat

### 10) Generisk copilot-retorik underminerar edge

- **Status:** ✅ Löst i README.
- **Implementerat:** positionering och produktgräns utgår från deterministic structured extraction, canonical output och lokal privacy i stället för generisk copilot-retorik.

### 11) Presets är inte tillräckligt synliga eller utbyggbara

- **Status:** ✅ Löst.
- **Implementerat:** kanoniskt redigerbart JSON-register, validerad serverinläsning, genererade browserkontrakt med driftkontroll samt dokumenterat format.

### 12) Ingen tydlig upgrade-path till team/self-hosted mode

- **Status:** ✅ Dokumentationskontrakt löst; funktionen är fortsatt uttryckligen planerad och inte skeppad.
- **Implementerat:** README avgränsar Team/Self-hosted mot operatorägd Ollama, zero-access-kryptering, tenant-/retentionkontroll, entitlementadministration och verifieringskrav före tillgänglighetsanspråk.

### 13) Tier-packaging och pricing-integritet behöver löpande styrning

- **Status:** 🟡 Delvis adresserat.
- **Implementerat:** README speglar repositoryts aktuella tier-priser, produktgränser och Paddle-mappning utan att beskriva konfiguration som fungerande produktionscheckout. Essential/Plus är stateless; Pro-state är explicit opt-in och användarstyrd.
- **Åtgärd kvar:**
  - säkra att Pro kontinuerligt får tydlig premium-differentiering mot Plus
  - håll fast vid arkitekturkontraktet: stateless core i Essential/Plus, stateful funktioner endast via explicit opt-in i Pro
  - gör retention alltid synlig och användarstyrd (inspect/export/delete) när stateful läge används
  - koppla release notes till tier-mervärde per version (Essential/Plus/Pro)
  - lägga in uppföljning på konvertering mellan tiers som produkt-KPI

---

## Prioriterad genomförandeordning (från nu)

1. Behörig oberoende approval och skyddad merge av PR #22; auto-merge är aktivt och skydd får inte kringgås.
2. Verifiera exakt merge-SHA på `main` med full CI, E2E, privacy och säkerhetskontroller.
3. Kör bootstrap och verklig Ollama-inferens på M1 8GB och M4 16GB; bevara latency-, minnes-, lång-input-, failure- och recovery-evidens.
4. Verifiera eller håll M1 Max 32GB/Advanced-lanen explicit blockerad utan produktanspråk.
5. Slutbedöm hela systemet mot Linear-acceptans och Definition of Done; uppdatera issues/projekt först efter observerad evidens.

---

## Finish line (kvalitetskrav innan "klart")

> Målnivå: **"Jonathan Ive-nivå" polish** + **installation enkel nog för en 89-åring**.

### 1) One-command installation (absolut först)

- **Mål:** användaren ska klara onboarding med en enda kommando-rad.
- **Kodstatus:** implementerad med explicit felhantering och hälsokontroll för Ollama, exakta modeller, launchd och `/health`.
- **Kvar:** reproducerbar körning på avsedda Apple-målmaskiner.

### 2) "89-åring-läge" i README (ultrakort onboarding)

- **Mål:** inga tekniska beslut i första flödet.
- **Status:** implementerad i README med tre steg och copy/paste-diagnostik.

### 3) UI/UX-polish till premium-kvalitet

- **Mål:** konsekvent, självförklarande och visuellt lugn panel/popup.
- **Kvar att leverera:**
  - enhetlig copy-ton och statusord i panel/popup
  - finjustera spacing/typografi i truth strip och runtime-indikatorer
  - säkra att knappar/labels är omedelbart begripliga vid första användning

### 4) E2E-bevis för verkligt användarflöde

- **Mål:** kunna verifiera funktion och privacy med reproducerbara tester.
- **Status:** automatiserat och grönt med deterministisk serverlivscykel, riktig unpacked-extension-path och strikt extern-nätverksblockering.
- **Kvar:** upprepa mot verklig Ollama på målmaskiner; testmocken är inte runtimebevis.

### 5) Strategisk finish (efter kvalitet + onboarding)

- **Status:** positioning, redigerbara presets och Team/Self-hosted-gräns är dokumenterade.
- **Kvar:** inget Team/Self-hosted-tillgänglighetsanspråk får göras före en separat implementerad och verifierad vertikal.

---

## Snabbreferens — Prioritetsmatris

| #  | Område                     | Prioritet | Status  | Effort |
|----|----------------------------|-----------|---------|--------|
| 1  | Versionsdrift              | P0        | Löst    | Låg    |
| 2  | Dubbla lock-filer          | P0        | Löst    | Låg    |
| 3  | Ogiltiga manifest-fält     | P0        | Löst    | Låg    |
| 4  | Onboarding-friktion        | P1        | Kod löst; fysisk verifiering kvar | Hög |
| 5  | Nginx/hosts osynlighet     | P1        | Löst*   | Hög    |
| 6  | README Quick Start         | P1        | Löst    | Låg    |
| 7  | E2E-tester extension       | P1        | Löst    | Medium |
| 8  | Privacy regressionstester  | P1        | Löst    | Medium |
| 9  | Verifierbar privacy-yta    | P1        | Löst    | Medium |
| 10 | Omformulera positioning    | P2        | Löst    | Låg    |
| 11 | Utbyggbara presets         | P2        | Löst    | Medium |
| 12 | Team/self-hosted-kontrakt  | P2        | Docs löst; produkt ej skeppad | Låg |
| 13 | Tier/pricing-integritet    | P2        | Delvis  | Medium |

\* Löst i huvudflödet, men behöver fortsatt skyddas från regression i docs/scripts.

---

*Senast uppdaterad: 2026-08-18*
