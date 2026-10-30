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

/** Farbtasten registrieren, damit sie bei der App ankommen */
export function registerKeys(): void {
  const t = api();
  if (!t || !t.tvinputdevice) return;
  const keys = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown'];
  for (const k of keys) {
    try {
      t.tvinputdevice.registerKey(k);
    } catch (e) {
      // Taste auf diesem Modell nicht vorhanden
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
 * Startet eine andere App. deeplink = optionaler Parameter (Format in Phase 4 am TV ermitteln):
 * wird als ApplicationControl-Datum «PAYLOAD» übergeben.
 */
export function launchApp(appId: string, deeplink: string | null): Promise<void> {
  const t = api();
  if (!t) return Promise.reject(new Error('Nur auf dem Fernseher möglich'));
  return new Promise((resolve, reject) => {
    const fail = (e: { message: string }) => reject(new Error(e.message));
    if (deeplink) {
      const data = [new t.application.ApplicationControlData('PAYLOAD', [deeplink])];
      const ctrl = new t.application.ApplicationControl('http://tizen.org/appcontrol/operation/view', null, null, null, data);
      t.application.launchAppControl(ctrl, appId, resolve, fail);
    } else {
      t.application.launch(appId, resolve, fail);
    }
  });
}
