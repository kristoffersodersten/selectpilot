# Platform Support

## Shipped target

- Chrome desktop on macOS 14 or later
- Apple Silicon and Intel are detected separately
- Ollama and the SelectPilot local helper are required

## Not currently supported

Chrome for Android does not install or run Chrome extensions. Google may offer “Add to Desktop” from a phone, but that schedules installation on a desktop browser; it does not make SelectPilot available inside Android Chrome.

Android support therefore requires a separate Android application or another explicitly supported browser runtime. SelectPilot must not claim Android Chrome compatibility until Google ships extension support and the complete local-processing path passes real-device verification.
