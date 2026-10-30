# Free-TV & Sport-Guide – Spezifikation

Zielgerät: **Samsung QE75Q70RATXZG** (Q70R, Baujahr 2019, Tizen 5.0) · Standort: **Schweiz** · Stand: 30.10.2026 (Phase 1 umgesetzt)

---

## 1. Ziel

Eine Tizen-Web-App mit drei Bereichen:

1. **Sender:** Free-TV-Senderliste (CH, DE, AT), wo verfügbar mit «Jetzt / Danach».
2. **Sport:** Alle **legal gratis** übertragenen Live-Events in Fussball, Eishockey und Motorsport.
3. **Jetzt live:** Was in diesem Moment läuft, aus beiden Bereichen.

**Die App spielt selbst nichts ab.** Mit der OK-Taste startet die offizielle Wiedergabe-App (primär **Zattoo Free CH**, sekundär **Play SRF**).

## 2. Harte Grenzen (nicht verhandelbar)

- Keine Wiedergabe fremder Streams, kein Umgehen von DRM oder Geoblocking, keine inoffiziellen Streamquellen oder M3U-Listen.
- Keine Pay-TV-Inhalte im Sport-Guide. Ein Event erscheint nur, wenn es laut `rights.yaml` frei empfangbar ist.
- Ausschliesslich private, nicht-kommerzielle Nutzung, wie es die Nutzungsbedingungen der SRG SSR API verlangen.
- Keine Senderlogos (Markenrechte). Kacheln zeigen nur den Sendernamen als Text.

## 3. Rahmenbedingungen

| Punkt | Wert | Status |
|---|---|---|
| Tizen-Version | 5.0 | Annahme, am TV verifizieren |
| Web-Engine | Chromium ca. M63 | Annahme, am TV verifizieren (`navigator.userAgent`) |
| Viewport | 1920×1080 (4K-Panel, Web-Apps rendern in 1080p) | Annahme |
| Wiedergabe | Zattoo-App: Samsung ab Tizen 2.3 unterstützt | Fakt (Zattoo-Support) |
| Entwicklungs-PC | Windows | Annahme (Nutzer: «PC») |
| Hosting der Daten | GitHub Actions → Branch `data`, ausgeliefert über `raw.githubusercontent.com` | Entscheid (Phase 1, siehe §5.5) |
| Pipeline-Laufzeit | Node 22 (natives TypeScript-Stripping, kein Build-Schritt) | Entscheid (Node 20 ist EOL) |

### Technische Folgen für Chromium ~M63

- Bundle als **IIFE**, Target `chrome63` (esbuild). Keine ES-Module im Output.
- Nicht verwenden: Optional Chaining `?.`, Nullish `??`, `flex`-`gap`, `Array.prototype.flat`, `Object.fromEntries`, `globalThis` (oder gezielt polyfillen).
- CSS Grid ist erlaubt (`grid-gap` statt `gap`).
- DOM schlank halten, keine schweren Frameworks: Vanilla TypeScript oder Preact.

## 4. Funktionen

### 4.1 Navigation

- Steuerung per Steuerkreuz mit eigenem Fokus-Manager (räumliche Navigation). Fokus immer sichtbar (≥ 4 px Rahmen).
- **Return/Back:** eine Ebene zurück, auf dem Startscreen Dialog «Beenden?».
- Optional: Farbtasten als Filter (rot = Fussball, grün = Eishockey, gelb = Motorsport, blau = alle). Tasten mit `tizen.tvinputdevice.registerKey` registrieren.

### 4.2 Tab «Jetzt live»

- Laufende Sport-Events (oben) und laufende Sendungen pro Sender (unten).
- Badge «LIVE» und Restzeit.

### 4.3 Tab «Sport»

- Filter Sportart: Fussball · Eishockey · Motorsport · Alle.
- Zeitraum: Heute · Morgen · 7 Tage.
- Zeile pro Event: Startzeit · Wettbewerb · Paarung oder Session · Sender · Badge (LIVE / bald / Highlights).
- Wettbewerbe:
  - **Fussball:** Super League, Challenge League, UEFA CL/EL/ECL, Nati, **Bundesliga** (inkl. Highlight-Sendungen, separat markiert)
  - **Eishockey:** National League, NHL, Nati/WM, Spengler Cup, CHL
  - **Motorsport:** F1 (Qualifying, Sprint, Rennen), MotoGP

### 4.4 Tab «Sender»

- Raster mit allen Sendern aus `channels.yaml`. Pro Kachel: Name, «Jetzt» und «Danach», sofern EPG vorhanden.
- Startliste: SRF 1, SRF zwei, SRF info, RTS 1, RTS 2, RSI LA 1, RSI LA 2, Das Erste, ZDF, 3sat, ORF 1, ORF 2, ServusTV, RTL, Sat.1, ProSieben, VOX, kabel eins, RTL Zwei, TV24, 3+, blue Zoom.
- Ob jeder Sender in Zattoo Free CH enthalten ist, wird in Phase 4 am TV geprüft. Geprüfte Sender erhalten `verified: true`, fehlende werden aus channels.yaml entfernt.

### 4.5 Aktion «OK»

1. Zattoo-App per `tizen.application.launchAppControl` starten, falls möglich mit Sender-Parameter.
2. **Fallback**, falls kein Deep-Link möglich ist: App öffnen und Hinweis «In Zattoo Sender X wählen» einblenden. Optional mit Programmplatz aus `channels.yaml`.
3. Für SRF-Sport-Livestreams ohne TV-Ausstrahlung: Play SRF starten (gleiches Muster).

> **Offen:** Zattoo-Tizen-App-ID und unterstützte Deep-Link-Parameter. Wird in Phase 4 auf dem TV ermittelt (installierte Apps über `sdb shell` auflisten, Launch testen).

### 4.6 Offline und Fehler

- Letzte `events.json` und `channels.json` in `localStorage` cachen (Zugriffe in `try/catch`).
- Bei Netzfehler: Cache anzeigen plus Hinweis «Stand: <Zeit>».

## 5. Datenarchitektur

```
GitHub Actions (cron alle 6 h, manuell, bei Push auf config/ oder pipeline/)
  ├─ 0. Vorherigen Stand aus Branch «data» als Cache laden
  ├─ 1. SRG SSR EPG API → SRF/RTS/RSI, heute + 7 Tage
  │      heute/morgen bei jedem Lauf, Folgetage max. 1× pro 20 h (Kontingent schonen)
  ├─ 2. config/manual_events.yaml → Sender ohne EPG-Quelle (TV24, 3+, blue Zoom, Sat.1 …)
  ├─ 3. Klassifizieren (config/rules.yaml: Titel/Untertitel/Genre → Wettbewerb, live/highlights/replay)
  ├─ 4. Filtern gegen config/rights.yaml (nur Free-Rechte, Gültigkeitszeitraum)
  └─ 5. Output → Branch «data» (force-push, immer genau 1 Commit):
         events.json, channels.json, epg.json, meta.json, debug/*, cache/srg/*
TV-App ── fetch (HTTPS) ──► https://raw.githubusercontent.com/markusbaechler/free-tv-guide/data/<datei>
```

### 5.1 Quellen

| Quelle | Inhalt | Zugang | Status |
|---|---|---|---|
| SRG SSR EPG API v3 (developer.srgssr.ch) | EPG SRF 1, SRF zwei, SRF info, RTS 1/2, RSI LA 1/2 | Gratis-Registrierung, Produkt «SRG SSR PUBLIC API V2». Token: `POST https://api.srgssr.ch/oauth/v1/accesstoken?grant_type=client_credentials` (Basic Auth). Daten: `GET /epg/v3/{bu}/tv/stations/{station}?date=YYYY-MM-DD` | Fakt (OpenAPI 3.0.8 im Portal: Antwort = Array mit `title`, `shortDescription`, `dateTimes`, `isLive`, `replica`; kein Genre). **Achtung:** Das Produkt «SRG SSR PUBLIC API V2» allein deckt `/epg/v3` nicht ab (getestet 30.10.2026: Video/Audio/Polis = 200, EPG = 404.01.001 «not enough privilege»). Der App muss zusätzlich das EPG-Produkt zugeordnet werden. ToS (Portalseite): Nutzung für beliebige Zwecke inkl. Websites und Apps erlaubt; Quellenangabe in `meta.json`. Kontingent unbekannt |
| EPG Nicht-SRG-Sender | TV24, 3+, blue Zoom, ARD, ZDF, RTL usw. | **Keine Quelle mit klaren Nutzungsbedingungen gefunden** (Phase 1). Scraping von TV-Zeitschriften oder Zattoo bewusst ausgeschlossen. Tab «Sender» zeigt dort nur den Namen | Entscheid |
| `manual_events.yaml` | Einzelne Events ohne EPG-Quelle | Manuell | Fallback |

### 5.2 Secrets (nur in GitHub Secrets, nie im Code oder Chat)

- `SRG_CLIENT_ID`
- `SRG_CLIENT_SECRET`

### 5.3 Schema `events.json`

```json
{
  "generatedAt": "2026-10-30T16:00:00Z",
  "events": [
    {
      "id": "srf2-20261101-2030",
      "sport": "football",
      "competition": "super-league",
      "competitionName": "Super League",
      "title": "FC Basel – BSC Young Boys",
      "subtitle": null,
      "kind": "live",
      "start": "2026-11-01T19:30:00Z",
      "end": "2026-11-01T21:45:00Z",
      "channel": "srf2",
      "reception": "ok",
      "source": "srg-epg"
    }
  ]
}
```

- `sport` ∈ `football | icehockey | motorsport`
- `kind` ∈ `live | highlights | replay` (`replay` = Wiederholung/Aufzeichnung, erkannt über rules.yaml oder Live-Flag der Quelle)
- `reception` ∈ `ok | uncertain` (aus rights.yaml; `uncertain` = Empfang über Zattoo Free CH nicht verifiziert)

### 5.3b `epg.json` und `meta.json`

- `epg.json`: pro SRG-Sender die Sendungen der nächsten 36 h (`title`, `subtitle`, `start`, `end`) für «Jetzt/Danach».
- `meta.json`: `generatedAt`, SRG-Status (`ok | partial | missing-credentials | auth-error | error`), Zählwerte, Warnungen, Quellenangabe.
- `debug/unclassified.json`: Sendungen mit Sportbezug ohne passende Regel → Grundlage für die Pflege von rules.yaml.

### 5.4 Schema `channels.json`

```json
{ "id": "srf1", "name": "SRF 1", "country": "CH", "epg": "srg:srf:srf-1", "zattoo": { "slot": null, "deeplink": null }, "verified": false }
```

### 5.5 Auslieferung (Entscheid Phase 1)

Statt GitHub Pages wird ein Branch `data` verwendet, ausgeliefert über `raw.githubusercontent.com` (CORS `*`, Cache ca. 5 Min.).
Grund: kein manueller Schritt in den Repo-Settings nötig, und der Branch dient gleichzeitig als Cache für den nächsten Lauf.
Die SRG-Portalseite erlaubt die Nutzung der EPG-Daten für Websites und Apps; veröffentlicht werden nur Titel, Zeiten und kurze Beschreibungen.

## 6. Rechte-Konfiguration 2026/27 (Startwerte, jährlich prüfen)

| Wettbewerb | Free in CH | Sender | Status |
|---|---|---|---|
| Super League | 1 Spiel pro Runde | SRF/RTS/RSI | Fakt (Spielplan SFL) |
| Challenge League | Top-Partie pro Spieltag | blue Zoom | Fakt |
| UEFA CL | 1 Spiel pro Runde + Final | SRF/RTS/RSI | Fakt, **endet nach 2026/27** |
| UEFA EL/ECL | 1 Spiel pro Runde + Finals | SRF/RTS/RSI | Fakt, bis 2026/27 |
| Nati Fussball | Live | SRF | Annahme, verifizieren |
| Bundesliga | Auftakt, einzelne Freitagsspiele, Relegation auf Sat.1 (DE) und Highlights (ARD/ZDF) | Sat.1, Das Erste, ZDF | **Unsicher**, ob im CH-Signal/Zattoo empfangbar |
| National League | Ausgewählte Spiele | Free-TV-Partner von MySports (u. a. CH Media) | Fakt (Umfang), Sender verifizieren |
| NHL | Bis 20 Spiele pro Saison | CH Media | Fakt |
| Eishockey Nati/WM, Spengler Cup, CHL | Live | SRF | Fakt (WM bis 2028) |
| F1 | Qualifying, Sprint, Rennen | SRF | Fakt (2026) |
| MotoGP | Rennen | SRF/RTS/RSI | Fakt (2026), **2027+ unsicher** |

**Bekannte Wechsel ab Sommer 2027:** keine CL mehr bei SRF, SRG verzichtet auf die Produktion der National League. Diese Änderungen nur in `rights.yaml` nachführen, ohne Code-Änderung.

## 7. Repo-Struktur

```
free-tv-guide/
├─ app/                      # Tizen-Web-App
│  ├─ config.xml             # required_version 5.0, Privilegien: internet, application.launch, tv.inputdevice
│  ├─ index.html
│  ├─ src/                   # TypeScript, Fokus-Manager, Views
│  └─ build.mjs              # esbuild → dist/ (IIFE, target chrome63)
├─ pipeline/                 # Node 22, TypeScript ohne Build-Schritt
│  ├─ sources/srg.ts
│  ├─ config.ts, time.ts, types.ts
│  ├─ classify.ts
│  ├─ rights.ts
│  ├─ main.ts
│  └─ test/                  # node --test
├─ config/
│  ├─ channels.yaml
│  ├─ rights.yaml
│  ├─ rules.yaml
│  └─ manual_events.yaml
├─ scripts/tv/               # PowerShell: build, sign, sdb connect, install, launch
├─ .github/workflows/
│  ├─ update-data.yml        # cron 17 */6 * * * + workflow_dispatch + Push auf config/
│  └─ ci.yml                 # Lint, Tests, App-Build
├─ SPEC.md
└─ CLAUDE.md
```

## 8. Phasen und Abnahmekriterien

| Phase | Inhalt | Wer | Abnahme |
|---|---|---|---|
| 0 | GitHub-Repo `free-tv-guide` (öffentlich), SRG-API-Konto und Key, Secrets setzen | Nutzer | Repo existiert, Secrets gesetzt (`meta.json` → `srg.status` ≠ `missing-credentials`) |
| 1 | Pipeline, Config, Workflow, Branch `data` | Claude | `events.json` wird automatisch erzeugt, enthält ≥ 1 Free-Event pro Sportart im 7-Tage-Fenster (sofern im Kalender vorhanden) |
| 2 | Tizen-App, Browser-Vorschau 1920×1080 | Claude | Alle Tabs per Tastatur (Pfeiltasten, Enter, Backspace) bedienbar, Build ohne Syntax neuer als ES2017 |
| 3 | Tizen Studio + TV-Extension, Samsung-Zertifikat (mit DUID des TVs), Entwicklermodus am TV (Apps → `12345` → Developer Mode ON, IP des PCs) | Nutzer, angeleitet | `sdb devices` zeigt den TV |
| 4 | Build, Signieren, Installieren, Zattoo-Deep-Link testen, Sender-Verfügbarkeit prüfen | Claude Code lokal | App startet auf dem TV, OK öffnet Zattoo |
| 5 | Betrieb: jährliche Erinnerung «rights.yaml prüfen» (Juli) | Automatisch | Erinnerung aktiv |

## 9. Offene Punkte und Risiken

1. **Zattoo-Deep-Link:** App-ID und Parameter unbekannt. Fallback ist definiert (4.5).
2. **EPG für Nicht-SRG-Sender:** keine Quelle mit klaren Nutzungsbedingungen. NHL, National League (TV24/3+), Challenge League (blue Zoom) und Bundesliga (Sat.1) nur über `manual_events.yaml`.
7. **SRG-Feldnamen und Kontingent:** nicht offiziell dokumentiert. Pipeline liest defensiv, protokolliert die Struktur in `debug/srg-shape.json`; Regeln nach dem ersten echten Lauf anhand von `debug/unclassified.json` nachschärfen.
3. **Bundesliga in CH:** Free-Empfang unklar. Im Guide als «Empfang unsicher» markieren, bis in Phase 4 verifiziert.
4. **Web-Engine-Version:** auf dem TV verifizieren und bei Abweichung das Build-Target anpassen.
5. **Samsung-Zertifikat:** Gültigkeitsdauer unklar. Neu-Signieren als Skript in `scripts/tv/`.
6. **Rechtewechsel 2027:** wird über `rights.yaml` abgefangen.
