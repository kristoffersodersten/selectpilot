# Chrome Web Store Submission Pack

Last updated: 2026-08-21

This document is the source of truth for SelectPilot's store listing. It does not prove that the extension has been submitted or published.

## Release State

`RELEASE CANDIDATE`: production entitlement verification and public policy/support artifacts are implemented. Upload remains gated on live Paddle configuration, public deployment, independent review, and exact-package verification.

## Listing Basics

- Product name: `SelectPilot`
- Category: `Productivity`
- Primary language: `English`
- Supported platform at launch: Chrome desktop on macOS 14 or later
- Store install: free
- Product access: seven-day trial followed by a paid tier, subject to production checkout and entitlement activation

## Single Purpose

SelectPilot turns text you select on a web page into structured, reusable output using a local Ollama runtime.

## Short Description

Turn selected text into structured, reusable output with local processing through Ollama.

## Detailed Description

SelectPilot helps you turn selected text into useful, consistent output without sending the core transformation flow to a cloud model.

Select text on a page, open SelectPilot, and choose the result you need:

- extract people, organizations, dates, decisions, and actions
- create a concise summary
- turn unstructured material into reusable JSON or Markdown
- copy or export the result into another tool

The core flow runs through a bridge and Ollama on your own computer. SelectPilot shows whether that local runtime is ready before processing begins.

Important requirements and limits:

- Ollama and the SelectPilot local bridge are required.
- Initial setup may download a model after explicit user consent.
- Production checkout and signed entitlement issuance must be operational before paid access is advertised as available.
- Audio transcription and vision OCR are not shipped capabilities.

## Privacy Tab Mapping

These answers must be rechecked against the exact submitted SHA and the hosted privacy policy.

### Data handled for core functionality

- Website content: selected text and active-page context chosen by the user
- User activity: the user's explicit SelectPilot actions and locally stored feature state
- Authentication information: local entitlement token and signed entitlement metadata

### Purpose

- Core functionality only

### Sale, advertising, and lending

- Data is not sold.
- Data is not used for personalized advertising.
- Data is not used for creditworthiness or lending.

### Permission justifications

- `activeTab`: access the current page only after a user action.
- `storage`: retain local settings, entitlement state, runtime state, and user-controlled local history.
- `scripting`: recover the current selection when content-script messaging is unavailable.
- `sidePanel`: provide the primary SelectPilot workspace.
- `http://127.0.0.1/*` and `http://localhost/*`: communicate with user-owned local services only.

## Store Assets

- Icon: [`assets/icon128.png`](../assets/icon128.png), `128x128`
- Screenshots: three PNG files in [`assets/marketing`](../assets/marketing), each `1280x800`
- Small promo tile: `selectpilot-small-promo.png`, `440x280`
- Marquee tile: `selectpilot-marquee.png`, `1400x560`

Run `pnpm validate:store` before uploading any asset.

## Required Public URLs

These values are external release gates and must be publicly reachable before submission:

- Homepage URL: `https://selectpilot.app/`
- Support URL: `https://selectpilot.app/support.html`
- Privacy policy URL: `https://selectpilot.app/privacy.html`

The repository copy of the policy is [`docs/PRIVACY_POLICY.md`](./PRIVACY_POLICY.md). A repository file is not a substitute for verifying the final public URL in the Store dashboard.

## Reviewer Instructions

1. Install Ollama from its official distribution and start it.
2. Install and start the SelectPilot local bridge.
3. Install the extension package.
4. Follow the in-product setup flow and approve the recommended local model download.
5. Open a web page, select text, and open SelectPilot.
6. Run a structured extraction and export the result.
7. Confirm that the core content flow uses only `127.0.0.1` or `localhost`.

Reviewer credentials or production entitlement instructions must be supplied through the Store's private reviewer field, never committed to this repository.

## Submission Rule

Do not describe SelectPilot as published, purchasable, or fully local until the corresponding behavior has been verified on the exact upload package. Dashboard entry, reviewer approval, and publication remain external actions.
