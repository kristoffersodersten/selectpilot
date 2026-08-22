# SelectPilot Privacy Policy

Last updated: 2026-08-21

SelectPilot turns text selected in a browser into structured output using services running on the user's own computer.

## Core Processing

When the user invokes a core text action, SelectPilot may handle:

- selected text from the active page
- the active page title and URL
- instructions entered in SelectPilot
- generated summaries and structured extraction results

The extension sends this content to the SelectPilot bridge on `127.0.0.1` or `localhost`. The bridge sends model requests to the user's configured local Ollama runtime. The core selected-text flow has no cloud-model fallback.

## Local Storage

SelectPilot may store the following on the user's device:

- settings and runtime state
- entitlement token and signed entitlement metadata
- model provisioning consent and status
- exported or retained results when the user enables a feature that requires them

Essential and Plus are designed without retained knowledge history. Pro features that retain local state must make that state visible and provide inspect, export, and delete controls.

## Commerce And Entitlements

Payment processing and entitlement issuance are separate from the core text-processing path. Production providers, endpoints, and data handling must be disclosed here before commerce is activated. Reviewer credentials and private tokens are never part of this public policy.

SelectPilot must not unlock paid features from an unsigned or unverifiable entitlement. The store release remains blocked until production signature verification is configured.

## Data Sharing

- Core selected text and generated output are not sold.
- Core selected text and generated output are not used for advertising.
- SelectPilot does not include product telemetry or analytics in the core runtime flow.
- SelectPilot does not send core selected text to an external inference provider by default.

The user may explicitly export a result to another application or service. That user-directed export is governed by the destination's own privacy terms.

## Experimental Capabilities

Audio transcription and vision OCR are not shipped capabilities. They require separate real local-runtime and privacy qualification before they can be exposed.

## User Control

Users can:

- choose when SelectPilot receives selected text
- approve or decline local model downloads
- inspect runtime and privacy state
- inspect, export, or delete supported retained data
- remove local data and uninstall the extension

## Security

SelectPilot minimizes data movement and validates local execution boundaries. No software can guarantee absolute security. Security reports should use the public support channel listed in the Chrome Web Store.

## Public Contact

`TBD before submission`: publish the same support URL here and in the Chrome Web Store listing.

## Changes

Material policy changes must be published no later than the extension version that introduces the corresponding behavior.
