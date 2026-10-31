// Dünne Hülle um die Tizen-Web-APIs. Im Browser (Vorschau) fehlen sie; dann liefern die Funktionen false.

interface TizenApi {
  application: {
    getCurrentApplication(): { exit(): void };
    launch(id: string, ok?: () => void, err?: (e: { message: string }) => void): void;
    launchAppControl(
      ctrl: unknown,
      id: string | null,
      ok?: () => void,
      err?: (e: { message: string }) => void,
    ): void;
    ApplicationControl: new (op: string, uri?: string | null, mime?: string | null, cat?: string | null, data?: unknown[]) => unknown;
    ApplicationControlData: new (key: string, value: string[]) => unknown;
  };
  tvinputdevice: {
    registerKey(name: string): void;
  };
}

function api(): TizenApi | null {
  const t = (window as unknown as { tizen?: TizenApi }).tizen;
  return t && t.application ? t : null;
}

export const isTizen = (): boolean => api() !== null;

/** Ergebnis der Tastenregistrierung (Diagnose): registriert / abgelehnt */
export const keyRegistration: { ok: string[]; failed: string[] } = { ok: [], failed: [] };

/** Farb-, Kanal-, Ziffern- und Medientasten registrieren, damit sie bei der App ankommen */
export function registerKeys(): void {
  const t = api();
  if (!t || !t.tvinputdevice) return;
  const keys = [
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'Info', 'PreCh', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'ChannelList', 'Guide', 'Tools', 'Extra', 'Caption',
  ];
  for (const k of keys) {
    try {
      t.tvinputdevice.registerKey(k);
      keyRegistration.ok.push(k);
    } catch (e) {
      // Taste auf diesem Modell nicht vorhanden oder systemreserviert
      keyRegistration.failed.push(k);
    }
  }
}

export function exitApp(): boolean {
  const t = api();
  if (!t) return false;
  t.application.getCurrentApplication().exit();
  return true;
}

/**
 * Startet eine andere App über einen App-Control-Aufruf (nicht über launch()), damit Tizen den Aufrufer
 * kennt und nach dem Beenden der anderen App zu dieser App zurückkehren kann (zusammen mit
 * background-support in config.xml). deeplink = optionaler Startparameter: als Datum «PAYLOAD»
 * (Samsung-Konvention «eden_resume», wie bei Smart-Hub-Preview-Deeplinks) und, falls es wie eine
 * Adresse aussieht, zusätzlich als URI. Format je App undokumentiert.
 */
export function launchApp(appId: string, deeplink: string | null): Promise<void> {
  const t = api();
  if (!t) return Promise.reject(new Error('Nur auf dem Fernseher möglich'));
  return new Promise((resolve, reject) => {
    const fail = (e: { message: string }) => reject(new Error(e.message));
    const plain = () => t.application.launch(appId, resolve, fail);
    try {
      const data = deeplink ? [new t.application.ApplicationControlData('PAYLOAD', [deeplink])] : [];
      const uri = deeplink && /^[a-z][a-z0-9+.-]*:\/\//i.test(deeplink) ? deeplink : null;
      const ctrl = new t.application.ApplicationControl('http://samsung.com/appcontrol/operation/eden_resume', uri, null, null, data);
      // Schlägt der App-Control-Weg fehl, einfacher Start ohne Parameter
      t.application.launchAppControl(ctrl, appId, resolve, plain);
    } catch (e) {
      plain();
    }
  });
}
