# free-tv-guide

Privater Free-TV- und Sport-Guide für einen Samsung-Fernseher (Tizen) in der Schweiz.
Die App zeigt, welche Spiele und Rennen **legal gratis** im Free-TV laufen, und startet zum Schauen die offizielle App (Zattoo Free / Play SRF). Sie spielt selbst nichts ab.

- Spezifikation: [SPEC.md](SPEC.md)
- Arbeitsanweisung für Claude Code: [CLAUDE.md](CLAUDE.md)

## TV-App

- `npm run app:build` → `app/dist` (Tizen-Web-App, geprüft auf Chromium 63 / ES2017)
- `npm run app:preview` → Vorschau auf http://localhost:8080 im Browser, Fenster 1920×1080
- Bedienung: Pfeiltasten, Enter = OK, Backspace = Zurück, 1–4 = Farbtasten (rot, grün, gelb, blau)
- Farbtasten am TV: grün Fussball, blau Eishockey, rot Motorsport, gelb alle

## Daten

Ein GitHub-Workflow erzeugt alle 6 Stunden die Daten und legt sie im Branch `data` ab:

| Datei | Inhalt |
|---|---|
| [events.json](https://raw.githubusercontent.com/markusbaechler/free-tv-guide/data/events.json) | Free-TV-Sportevents, heute + 7 Tage |
| [epg.json](https://raw.githubusercontent.com/markusbaechler/free-tv-guide/data/epg.json) | «Jetzt/Danach» für SRG-Sender |
| [channels.json](https://raw.githubusercontent.com/markusbaechler/free-tv-guide/data/channels.json) | Senderliste |
| [meta.json](https://raw.githubusercontent.com/markusbaechler/free-tv-guide/data/meta.json) | Status und Zählwerte |

Rechte pflegen: `config/rights.yaml` · Events ohne EPG nachtragen: `config/manual_events.yaml`

Programmdaten: SRG SSR (developer.srgssr.ch). Private, nicht-kommerzielle Nutzung.
