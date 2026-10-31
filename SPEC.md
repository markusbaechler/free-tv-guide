# Free-TV & Sport-Guide – Spezifikation

Zielgerät: **Samsung QE75Q70RATXZG** (Q70R, Baujahr 2019, Tizen 5.0) · Standort: **Schweiz** · Stand: 30.10.2026 (Phase 1 umgesetzt)

---

## 1. Ziel

Eine Tizen-Web-App mit drei Bereichen:

1. **Sender:** Free-TV-Senderliste (CH, DE, AT), wo verfügbar mit «Jetzt / Danach».
2. **Sport:** Alle **legal gratis** übertragenen Live-Events in Fussball, Eishockey und Motorsport.
3. **Jetzt live:** Was in diesem Moment läuft, aus beiden Bereichen.

**Wiedergabe (Entscheid 30.10.2026, ergänzt um Joyn):** SRG-Sender spielt die App selbst ab (Pillarbox, ohne Zeitlimit, ohne Zusatzwerbung; die normale Senderwerbung bleibt Teil des Programms). Zattoo Free ist nur noch Ausweg für Nicht-SRG-Sender, weil es am TV auf **10 h pro Monat** begrenzt ist und beim Umschalten Werbung zeigt.

## 2. Harte Grenzen (nicht verhandelbar)

- Wiedergabe in der App für **SRG-Sender** (SRF, RTS, RSI) über die offizielle «SRGSSR Video»-API (Livestream-URN) und den offiziellen SRG-Player «Pillarbox», so wie es die SRG auf ihrem Entwicklerportal vorsieht.
- **Erweiterung (Entscheid Nutzer 31.10.2026, privater Gebrauch):** Zusätzlich dürfen **offizielle Livestreams des jeweiligen Senders** in der App abgespielt werden (`app: direct`), wenn alle Bedingungen erfüllt sind: der Stream stammt von der Website des Senders selbst, ist dort gratis, ohne Login, ohne DRM und ohne Geoblocking für die Schweiz abrufbar; je Sender sind in `channels.yaml` Quelle (Live-Seite) und Prüfdatum dokumentiert; die App gibt den Stream unverändert wieder (Senderwerbung bleibt). Keine offizielle Freigabe der Sender für Dritt-Apps – Einordnung «privat vertretbar». Bei Ausfall meldet die App «Stream lässt sich nicht abspielen», Alternative Joyn/Zattoo.
- Weiterhin ausgeschlossen: Fremd- oder Sammelquellen (M3U-/IPTV-Listen, Mirror, Proxys), Umgehen von DRM, Geoblocking (auch per VPN) oder Werbung, geoblockte Streams (ARD, ZDF, ORF, arte), Streams hinter Login oder Werbe-Zwangszustimmung (ServusTV On, oneplus/3+).
- Nicht-SRG-Sender nur über offizielle Apps: **Joyn Schweiz** (Das Erste, ZDF, 3sat, RTL CH, VOX CH, ProSieben, Sat.1, kabel eins, RTL Zwei, 3+ …; gratis, kurze Werbespots vor dem Stream, kein Zeitlimit bekannt), sonst **Zattoo Free** (ORF, ServusTV, TV24, blue Zoom; Werbung, 10 h/Monat am TV). Zuordnung je Sender in `channels.yaml` (`app`).
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
- Farbtasten als Filter, Farbe = Sportfarbe: grün = Fussball, blau = Eishockey, rot = Motorsport, gelb = alle. Browser-Vorschau: 1 rot, 2 grün, 3 gelb, 4 blau. Tasten mit `tizen.tvinputdevice.registerKey` registrieren.

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

### 4.5 Aktion «OK» (neu ab 30.10.2026)

- Event auf SRG-Sender, läuft oder beginnt in < 15 Min. → sofort Vollbild-Player.
- Event später → Dialog «Beginnt um …» mit «<Sender> jetzt einschalten».
- Sender-Kachel mit Livestream (SRG-URN oder `app: direct`) → sofort Player. Ohne → Dialog mit Joyn- bzw. Zattoo-Hinweis und Knopf «Joyn/Zattoo öffnen».
- Im Player: Hoch/Runter bzw. CH+/CH− wechselt zwischen den SRG-Sendern, OK zeigt Info inkl. Bildgrösse (z. B. 1920×1080), Zurück führt in den Guide. Der Player startet mit hoher Bandbreitenschätzung (20 Mbit/s), sonst beginnt er am TV mit 640×360.
- Start-Tab ist «Jetzt live». Der Status-Balken zeigt «Stand hh:mm» der Daten und die App-Version (aus `config.xml`).
- Player-Code (Pillarbox + video.js, ~800 KB) liegt in `player.js` und wird erst beim ersten Abspielen geladen. `globalThis` wird für Chromium 63 per Banner nachgerüstet.

### 4.5a Aktion «OK» für Nicht-SRG-Sender (Ergebnis Phase 4, 31.10.2026)

1. Joyn bzw. Zattoo per `tizen.application.launchAppControl` (Operation `eden_resume`, Datum `PAYLOAD`, bei Adressen zusätzlich als URI) starten; Fallback `launch()`. App-IDs am QE75Q70R: Joyn `2200MKoe7c.ZAPPNTV`, Zattoo `QZf9YjXnoV.Zattoo` (`app/src/settings.ts`).
2. **Kein Deep-Link möglich:** Joyn öffnet immer nur seine Startseite. Getestet mit TeleZüri (in Joyn CH gelistet): Web-Adresse `https://www.joyn.ch/play/live-tv/telezueri` (URI + PAYLOAD), `joyn://live-tv/telezueri`, PAYLOAD-JSON `{"values":"telezueri"}`. Keine der Varianten wirkt; weder Joyn noch Zattoo dokumentieren eine Schnittstelle. Der Sender wird in der App gewählt; der Dialog sagt das («Dort X wählen»). Das Feld `deeplink` in `channels.yaml` bleibt für künftige Versuche (Daten laden ohne Neuinstallation).
3. **Rückkehr in den Guide:** Joyn/Zattoo kehren beim Beenden nicht zum Aufrufer zurück (Return in Joyn = Joyn-Startseite, Return lang ohne Wirkung). Rückweg über Home-Taste. `background-support` ist aktiv, damit die App im Hintergrund bleibt; beim Sichtbarwerden lädt sie die Daten neu.
4. Für SRF-Sport-Livestreams ohne TV-Ausstrahlung: Play SRF starten (gleiches Muster).

### 4.5b Darstellung (Entscheid Phase 2)

- Leitbild Abfahrtstafel: Startzeit gross links, Spiel in der Mitte, Sender rechts als Kasten. Gelb ist allein dem Fokus vorbehalten; Sportfarben grün (Fussball), eisblau (Eishockey), rot (Motorsport) als Randstreifen.
- Gleiches Spiel auf SRF/RTS/RSI wird zu einer Zeile zusammengefasst (gleicher Wettbewerb und Typ, Start ≤ 45 Min. auseinander). Angezeigt wird der deutschsprachige Sender, die übrigen als «auch …».
- Highlights und Wiederholungen sind standardmässig ausgeblendet (Schalter «Auch zeigen»).
- Läuft im gewählten Zeitraum nichts, zeigt die Tafel die nächsten 5 Termine.
- Navigation: hoch/runter bleibt in der Spalte; am Listenende bleibt der Fokus stehen.

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
| SRG SSR EPG API v3 (developer.srgssr.ch) | EPG SRF 1, SRF zwei, SRF info, RTS 1/2, RSI LA 1/2 | Gratis-Registrierung, Produkt «SRG SSR PUBLIC API V2». Token: `POST https://api.srgssr.ch/oauth/v1/accesstoken?grant_type=client_credentials` (Basic Auth). Daten: `GET /epg/v3/{bu}/tv/stations/{station}?date=YYYY-MM-DD` | Fakt (OpenAPI 3.0.8 im Portal: Antwort = Array mit `title`, `subTitle`, `shortDescription`, `dateTimes`, `isLive`, `replica`, `genre`). **Achtung:** Das Produkt «SRG SSR PUBLIC API V2» allein deckt `/epg/v3` nicht ab (404.01.001 «not enough privilege»). Der App muss zusätzlich «SRGSSR EPG V3» zugeordnet sein (erledigt 30.10.2026). ToS (Portalseite): Nutzung für beliebige Zwecke inkl. Websites und Apps erlaubt; Quellenangabe in `meta.json`. Kontingent unbekannt |
| EPG Nicht-SRG-Sender | TV24, 3+, blue Zoom, ARD, ZDF, RTL usw. | **Keine Quelle mit klaren Nutzungsbedingungen gefunden** (Phase 1). Scraping von TV-Zeitschriften oder Zattoo bewusst ausgeschlossen. Tab «Sender» zeigt dort nur den Namen | Entscheid |
| `manual_events.yaml` | Einzelne Events ohne EPG-Quelle | Manuell | Fallback |
| SRGSSR Video API v2 (`/videometadata/v2/livestreams?bu=…`) | Livestream-URN je SRG-Sender (für Pillarbox) | Gleiche Zugangsdaten wie EPG | Fakt. Portal: Livestreams dürfen in eigenen Websites und Apps abgespielt werden, mit Pillarbox |
| CH Media Regionalsender (telezueri.ch, telebaern.tv, telem1.ch, tele1.ch, tvo-online.ch, je `/live`) | Livestream TeleZüri, TeleBärn, Tele M1, Tele 1, TVO | Gratis, ohne Login, DASH ohne DRM, aus CH abrufbar – **aber der CDN (oneplusstream-prod.akamaized.net) erlaubt nur CH-Media-Ursprünge (CORS)**: Abruf von fremden Seiten und vom TV scheitert (31.10.2026). Kein Proxy/Umweg | **Nicht nutzbar** → Joyn |
| TeleBasel (telebasel.ch/livestream) | Livestream TeleBasel | Gratis, ohne Login, HLS bis 1080p, geprüft 31.10.2026 | Entscheid: `app: direct` |
| 3sat-Mediathek (3sat.de/programm) | Livestream 3sat, DACH-Variante | Gratis, ohne Login, HLS ohne DRM, aus CH abrufbar (geprüft 31.10.2026). ZDF-Nutzungsbedingungen: privater Gebrauch; Adresse wie vom 3sat-Player geladen | Entscheid: `app: direct` |
| tagesschau.de (Livestream «Internationales Angebot») | tagesschau24 ohne Sportnachrichten | Offiziell für das Ausland vorgesehen, HLS 720p, geprüft 31.10.2026 | Entscheid: `app: direct` |
| Geprüft und **ausgeschlossen** (31.10.2026) | arte (Geoblocking DE/FR, arte-API: Land CH → 0 Streams), ServusTV On (Zwangszustimmung zu personalisierter Werbung oder Abo), ARD/ZDF-Hauptprogramme (Geoblocking DE), ORF (Geoblocking AT), TeleTop (Live-Seite nicht gefunden) | – | bleiben Joyn/Zattoo |

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
{ "id": "srf1", "name": "SRF 1", "country": "CH", "epg": "srg:srf:srf-1", "app": "srg", "deeplink": null, "verified": false, "live": { "urn": "urn:srf:video:…" } }
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
| 1 ✅ | Pipeline, Config, Workflow, Branch `data` (abgenommen 30.10.2026) | Claude | `events.json` wird automatisch erzeugt, enthält ≥ 1 Free-Event pro Sportart im 7-Tage-Fenster (sofern im Kalender vorhanden) |
| 2 ✅ | Tizen-App, Browser-Vorschau 1920×1080 (abgenommen 30.10.2026) | Claude | Alle Tabs per Tastatur (Pfeiltasten, Enter, Backspace) bedienbar, Build ohne Syntax neuer als ES2017 |
| 3 ✅ | **Apps2Samsung 2.8.3** statt Tizen Studio (Entwicklungs-PC ist Windows-ARM; Tizen Studio nur x64). Entwicklermodus am TV (Apps → `12345` → On, Host-PC-IP 192.168.178.61, dann TV neu starten). TV 192.168.178.21 (abgenommen 31.10.2026) | Nutzer, angeleitet | Apps2Samsung findet den TV |
| 4 ✅ | Build (`npm run app:build`), unsigniertes `.wgt` (`zip -X -r`), Installation über Apps2Samsung «Andere → Custom WGT / TPK», SRG-Livestream am TV, Joyn/Zattoo-IDs (abgenommen 31.10.2026, v0.1.4) | Claude Code | App startet auf dem TV, OK spielt SRF zwei live in 1920×1080 ab ✅ |
| 5 | Betrieb: jährliche Erinnerung «rights.yaml prüfen» (Juli) | Automatisch | Erinnerung aktiv |

## 9. Offene Punkte und Risiken

1. **Joyn-/Zattoo-Deep-Link:** nicht möglich (siehe 4.5a). App öffnet, Sender dort wählen.
10. **Entwickler-Verbindung:** Nach Standby meldet Apps2Samsung «TV-Name konnte nicht gefunden werden», obwohl der TV im Scan erscheint. Abhilfe: TV neu starten (Power 5 s).
11. **Chromium 63:** Prozent-Höhen in Flex-Kindern werden nicht aufgelöst (Listen liefen unter die Fusszeile, kein Scrollen). Hauptbereich und Listen haben feste Höhe 832 px.
9. **Joyn Schweiz auf Samsung:** Joyn-App laut Herstellerangaben ab Samsung-Baujahr 2017; Verfügbarkeit im Schweizer Samsung-Store und Sport-Sperren (Geoblocking) bei ARD/ZDF über Joyn CH am TV prüfen.
8. **Pillarbox auf Tizen 5.0 (Chromium ~63):** ✅ läuft auf dem Q70R inkl. DRM, 1920×1080 (31.10.2026).
2. **EPG für Nicht-SRG-Sender:** keine Quelle mit klaren Nutzungsbedingungen. NHL, National League (TV24/3+), Challenge League (blue Zoom) und Bundesliga (Sat.1) nur über `manual_events.yaml`.
7. **SRG-Feldnamen und Kontingent:** nicht offiziell dokumentiert. Pipeline liest defensiv, protokolliert die Struktur in `debug/srg-shape.json`; Regeln nach dem ersten echten Lauf anhand von `debug/unclassified.json` nachschärfen.
3. **Bundesliga in CH:** Free-Empfang unklar. Im Guide als «Empfang unsicher» markieren, bis in Phase 4 verifiziert.
4. **Web-Engine-Version:** auf dem TV verifizieren und bei Abweichung das Build-Target anpassen.
5. **Signieren:** entfällt – Apps2Samsung installiert das unsignierte `.wgt` ohne Samsung-Konto. `scripts/tv/install.ps1` (Tizen Studio) nicht umgesetzt.
6. **Rechtewechsel 2027:** wird über `rights.yaml` abgefangen.
