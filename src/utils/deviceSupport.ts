import type { DetectedDevice } from './tauri-bridge';

const ISSUES_URL = 'https://github.com/samak97/Frazer/issues/new';

export const usbId = (pid: number) => `1532:${pid.toString(16).toUpperCase().padStart(4, '0')}`;

export const deviceName = (d: DetectedDevice) => d.name || `Razer device ${usbId(d.pid)}`;

/** The plugged-in Razer audio device Frazer can't drive, most informative first. */
export function unsupportedDevice(detected: DetectedDevice[]): DetectedDevice | undefined {
  const rank = { unsupported: 0, identifying: 1, unidentified: 2, supported: 3 } as const;
  return detected.filter((d) => d.status !== 'supported').sort((a, b) => rank[a.status] - rank[b.status])[0];
}

/** A GitHub "new issue" link filled in with everything needed to add the model. */
export function supportRequestUrl(d: DetectedDevice, appVersion: string): string {
  const body = [
    `**Headset:** ${deviceName(d)}`,
    `**USB ID:** \`${usbId(d.pid)}\` (interfaces ${d.interfaces.join(', ')})`,
    `**Synapse driver:** ${d.family ? `\`${d.family}\`` : 'unknown'}`,
    `**Frazer:** ${appVersion}`,
    '',
    'Anything else about the headset (wireless/wired, features you use most):',
    '',
  ].join('\n');
  const params = new URLSearchParams({ title: `Support for ${deviceName(d)}`, body });
  return `${ISSUES_URL}?${params}`;
}
