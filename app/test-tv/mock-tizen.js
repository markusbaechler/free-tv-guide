// Fernseher-Simulator: nachgebaute Tizen-TV-APIs (tizen.tvchannel, tizen.tvwindow, tizen.TZDate, tizen.application,
// tizen.systeminfo) mit den Datenformen, die der QE75Q70R am 31.10.2026 geliefert hat:
// - Senderliste: {_serviceId, channelName, lcn: 65535, major, minor: 65534, ...}
// - getProgramList: Startzeit MUSS ein tizen.TZDate sein, sonst «Cannot convert … to .»
// - ProgramInfo: {detailedDescription, title, startTime: TZDate, duration (Sekunden)}
// Wird in der Vorschau per Playwright vor app.js eingefügt (addInitScript).
(function () {
  function TZDate(d) {
    this._d = d instanceof Date ? d : new Date(d);
  }
  ['getUTCFullYear', 'getUTCMonth', 'getUTCDate', 'getUTCHours', 'getUTCMinutes', 'getUTCSeconds', 'getFullYear', 'getMonth', 'getDate', 'getHours', 'getMinutes', 'getSeconds'].forEach(function (m) {
    TZDate.prototype[m] = function () {
      return this._d[m]();
    };
  });
  TZDate.prototype.toString = function () {
    return this._d.toString();
  };

  // Fixture-Felder: name, major, tsid (Transponder; Standard: eigener), scrambled (verschlüsselt → kein Signal)
  var channels = (window.__MOCK_CHANNELS__ || []).map(function (c, i) {
    // 19-stellige Kennung als Zeichenkette (als Zahl wäre sie jenseits von 2^53 und nicht mehr eindeutig)
    var o = { _serviceId: '808364591558653' + (7470 + i), channelName: c.name, lcn: 65535, major: c.major, minor: 65534, ptc: 100 + i, sourceID: 0, programNumber: 1000 + i, originalNetworkID: 1, transportStreamID: c.tsid || 1050 + i };
    if (c.scrambled) o.scrambled = true;
    return o;
  });
  var epg = window.__MOCK_EPG__ || {}; // channelName -> [{title, description, start (ISO), durationSec}]
  var log = (window.__MOCK_LOG__ = []);
  var current = null;
  var muted = false;
  // Wie am QE75Q70R: das volle 7-Tage-Programm hat der Fernseher nur für den zuletzt abgestimmten Transponder,
  // und erst, wenn er dort eine Weile war (Tabellen eingesammelt). Sonst nur jetzt/danach.
  var fullSince = null;
  var COLLECT_MS = Number(window.__MOCK_EPG_COLLECT_MS__ || 150);

  window.tizen = {
    TZDate: TZDate,
    tvchannel: {
      getChannelList: function (ok, err, mode) {
        setTimeout(function () {
          ok(channels.slice());
        }, 30);
      },
      tune: function (option, cb, err, win) {
        var ch = channels.filter(function (c) {
          return c.major === option.major;
        })[0];
        setTimeout(function () {
          if (!ch) return err({ message: 'Failed to set selected channel' });
          if (!current || current.transportStreamID !== ch.transportStreamID) fullSince = Date.now() + COLLECT_MS;
          current = ch;
          log.push('tune ' + ch.channelName);
          if (ch.scrambled || /ORF/.test(ch.channelName)) return cb.onnosignal && cb.onnosignal();
          cb.onsuccess && cb.onsuccess(ch, win);
        }, 20);
      },
      getCurrentChannel: function () {
        return current;
      },
      getProgramList: function (ch, start, ok, err, duration) {
        if (!(start instanceof TZDate)) {
          setTimeout(function () {
            err({ message: 'Cannot convert ' + String(start) + ' to .' });
          }, 5);
          return;
        }
        // Wie der QE75Q70R: nur Sendungen ab Startzeit, höchstens 12 je Abruf; volles Programm nur auf dem
        // abgestimmten Transponder (nach Sammelzeit), sonst jetzt/danach (2 Einträge ab jetzt)
        var fromMs = start._d.getTime();
        var full = current && current.transportStreamID === ch.transportStreamID && fullSince !== null && Date.now() >= fullSince;
        var list = (epg[ch.channelName] || [])
          .filter(function (p) {
            return new Date(p.start).getTime() >= (full ? fromMs : Date.now()) - 3600 * 1000;
          })
          .sort(function (a, b) {
            return new Date(a.start) - new Date(b.start);
          })
          .slice(0, full ? 12 : 2)
          .map(function (p) {
            var o = { detailedDescription: p.description || '', title: p.title, startTime: new TZDate(p.start) };
            if (p.durationSec) o.duration = p.durationSec;
            return o;
          });
        setTimeout(function () {
          ok(list);
        }, 10);
      },
    },
    tvwindow: {
      show: function (ok, err, rect, type, z) {
        log.push('tvwindow.show ' + z);
        setTimeout(function () {
          ok(rect, type);
        }, 10);
      },
      hide: function (ok) {
        log.push('tvwindow.hide');
        setTimeout(ok, 10);
      },
      setSource: function (src, ok) {
        setTimeout(function () {
          ok(src, 'MAIN');
        }, 10);
      },
      getSource: function () {
        return { type: 'TV', number: 1 };
      },
    },
    tvaudiocontrol: {
      setMute: function (on) {
        muted = !!on;
        log.push(on ? 'mute on' : 'mute off');
      },
      isMute: function () {
        return muted;
      },
    },
    systeminfo: {
      getPropertyValue: function (prop, ok) {
        setTimeout(function () {
          ok({ connected: [{ type: 'TV', number: 1 }, { type: 'HDMI', number: 1 }], disconnected: [{ type: 'HDMI', number: 2 }] });
        }, 5);
      },
    },
    application: {
      getCurrentApplication: function () {
        return { exit: function () { log.push('exit'); } };
      },
      launch: function (id, ok) {
        log.push('launch ' + id);
        setTimeout(ok, 5);
      },
      launchAppControl: function (ctrl, id, ok) {
        log.push('launchAppControl ' + id);
        setTimeout(ok, 5);
      },
      ApplicationControl: function (op, uri, mime, cat, data) {
        this.operation = op;
        this.uri = uri;
        this.data = data;
      },
      ApplicationControlData: function (key, value) {
        this.key = key;
        this.value = value;
      },
    },
    tvinputdevice: { registerKey: function () {} },
  };
})();
