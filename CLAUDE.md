# CLAUDE.md – free-tv-guide

Massgeblich ist **SPEC.md**. Bei Widerspruch gilt SPEC.md. Bei Unklarheit nachfragen, nicht raten.

## Kontext

- Tizen-Web-App für Samsung QE75Q70R (2019, Tizen 5.0, Chromium ~M63). Nutzer in der Schweiz.
- Die App bündelt legale Free-TV-Programminfos. SRG-Sender spielt sie selbst ab (Pillarbox), andere Sender nur über die Zattoo-App.
- Entwicklungs-PC: Windows. Skripte in PowerShell.

## Harte Regeln

- Wiedergabe nur für SRG-Sender über SRG-API-URN + offiziellen Player Pillarbox. Keine anderen Streamquellen, keine Stream-URLs in Code/Daten, kein Umgehen von DRM, Geoblocking oder Werbung, keine M3U- oder IPTV-Quellen.
- Keine Senderlogos, nur Text.
- Secrets (`SRG_CLIENT_ID`, `SRG_CLIENT_SECRET`, Zertifikats-Passwörter) nie committen, loggen oder ausgeben.
- Neue Datenquellen nur nach Prüfung der Nutzungsbedingungen. Ergebnis in SPEC.md §5.1 dokumentieren.
- Rechteänderungen nur in `config/rights.yaml`, nicht im Code.
- Neue Klassifizierungsregeln in `config/rules.yaml`, immer mit Testfall in `pipeline/test/classify.test.ts`.

## Build-Regeln App

- esbuild, Output als IIFE, `target: chrome63`.
- Verboten im Output: `?.`, `??`, `flex`-`gap`, ES-Module. Nach jedem Build mit einem Skript auf diese Syntax prüfen (`app/check-syntax.mjs`, prüft `app.js` und `player.js`).
- `player.js` (Pillarbox + video.js) wird lazy geladen; `globalThis` nur über den Build-Banner nachrüsten.
- Jeder Zugriff auf `localStorage` in `try/catch`.
- Testen im Browser mit 1920×1080 und reiner Tastatursteuerung (Pfeiltasten, Enter, Backspace = Return).

## Befehle (Zielzustand)

- `npm run pipeline` – Daten lokal nach `out/` erzeugen (braucht die Env-Variablen `SRG_CLIENT_ID` und `SRG_CLIENT_SECRET`, sonst nur manuelle Events)
- `npm run check` – Typecheck und Tests der Pipeline
- Daten live: `https://raw.githubusercontent.com/markusbaechler/free-tv-guide/data/events.json` (bzw. `channels.json`, `epg.json`, `meta.json`)
- `npm run app:build` – App nach `app/dist`
- `npm run app:preview` – lokale Vorschau auf http://localhost:8080 (Daten live; mit `?data=./data/` aus `app/dist/data/`)
- `npm run app:standalone` – eigenständige Vorschau-Seite mit eingebetteten Daten aus `out/` (vorher `npm run pipeline`)
- `scripts/tv/install.ps1` – Signieren, `sdb connect <TV-IP>`, Installieren, Starten

## Arbeitsweise

- Phasen gemäss SPEC.md §8. Pro Phase die Abnahmekriterien prüfen, bevor die nächste beginnt.
- Am TV nichts tun, was dort Daten löscht oder Einstellungen ändert, ausser dem dokumentierten Entwicklermodus-Ablauf.
