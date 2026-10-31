# CLAUDE.md – free-tv-guide

Massgeblich ist **SPEC.md**. Bei Widerspruch gilt SPEC.md. Bei Unklarheit nachfragen, nicht raten.

## Kontext

- Tizen-Web-App für Samsung QE75Q70R (2019, Tizen 5.0, Chromium ~M63). Nutzer in der Schweiz.
- Die App bündelt legale Free-TV-Programminfos. SRG-Sender spielt sie selbst ab (Pillarbox, SRG-API-URN); Sender mit offiziellem, frei zugänglichem Livestream (CH-Media-Regionalsender, TeleBasel, 3sat, tagesschau24) ebenfalls selbst (`app: direct`); übrige nur über die Joyn- oder Zattoo-App (kein Deeplink möglich, Sender dort wählen).
- Entwicklungs-PC: Windows auf ARM (kein Tizen Studio). Installation auf dem TV über **Apps2Samsung** (Custom WGT / TPK), unsigniertes `.wgt` aus `app/dist` mit `zip -X -r`.

## Harte Regeln

- Wiedergabe: SRG-Sender über SRG-API-URN + Pillarbox. Andere Sender nur über ihren **eigenen offiziellen Livestream** (gratis, ohne Login, ohne DRM, ohne Geoblocking für CH), Adresse ausschliesslich in `config/channels.yaml` mit `source` (Live-Seite des Senders) und `checked` (Prüfdatum aus CH) – Entscheid Nutzer 31.10.2026, siehe SPEC.md §2 und §5.1. Keine Stream-Adressen im Code. Keine Fremd- oder Sammelquellen (M3U, IPTV, Mirror, Proxys), kein Umgehen von DRM, Geoblocking (auch kein VPN) oder Werbung.
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
- Chromium 63 löst Prozent-Höhen in Flex-Kindern nicht auf: Hauptbereich und Listen mit fester Höhe (832 px), sonst kein Scrollen am TV.
- Version in `app/config.xml` bei jeder Installation erhöhen; sie wird im Status-Balken angezeigt.
- Testen im Browser mit 1920×1080 und reiner Tastatursteuerung (Pfeiltasten, Enter, Backspace = Return).

## Befehle (Zielzustand)

- `npm run pipeline` – Daten lokal nach `out/` erzeugen (braucht die Env-Variablen `SRG_CLIENT_ID` und `SRG_CLIENT_SECRET`, sonst nur manuelle Events)
- `npm run check` – Typecheck und Tests der Pipeline
- Daten live: `https://raw.githubusercontent.com/markusbaechler/free-tv-guide/data/events.json` (bzw. `channels.json`, `epg.json`, `meta.json`)
- `npm run app:build` – App nach `app/dist`
- `npm run app:preview` – lokale Vorschau auf http://localhost:8080 (Daten live; mit `?data=./data/` aus `app/dist/data/`)
- `npm run app:standalone` – eigenständige Vorschau-Seite mit eingebetteten Daten aus `out/` (vorher `npm run pipeline`)
- Installation: `.wgt` nach `Downloads` kopieren, Apps2Samsung → Andere → Custom WGT / TPK → Herunterladen & Installieren. Bei «TV-Name konnte nicht gefunden werden»: TV neu starten.

## Arbeitsweise

- Phasen gemäss SPEC.md §8. Pro Phase die Abnahmekriterien prüfen, bevor die nächste beginnt.
- Am TV nichts tun, was dort Daten löscht oder Einstellungen ändert, ausser dem dokumentierten Entwicklermodus-Ablauf.
