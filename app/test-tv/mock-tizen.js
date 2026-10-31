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

  var channels = (window.__MOCK_CHANNELS__ || []).map(function (c, i) {
    return { _serviceId: String(8083645915586537470 + i), channelName: c.name, lcn: 65535, major: c.major, minor: 65534, ptc: 100 + i, sourceID: 1, programNumber: 1000 + i, originalNetworkID: 1, transportStreamID: 1050 + i };
  });
  var epg = window.__MOCK_EPG__ || {}; // channelName -> [{title, description, start (ISO), durationSec}]
  var log = (window.__MOCK_LOG__ = []);
  var current = null;

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
          current = ch;
          log.push('tune ' + ch.channelName);
          if (/ORF/.test(ch.channelName)) return cb.onnosignal && cb.onnosignal();
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
        var list = (epg[ch.channelName] || []).map(function (p) {
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
