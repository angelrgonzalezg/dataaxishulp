import { prisma } from '../../config/db';
import { describeWhatsApp, getWhatsAppSettings, sendWhatsAppText } from './whatsapp.client';

export type AlertKind = 'offline' | 'degraded' | 'recovered' | 'resource';
export type AlertSeverity = 'warning' | 'critical' | 'recovered';

const lastSentAt = new Map<string, number>();
let lastDispatchError: string | null = null;
let lastDispatchAt: Date | null = null;

function formatWhatsAppMessage(input: {
  severity: AlertSeverity;
  kind: AlertKind;
  message: string;
}): string {
  const title =
    input.severity === 'critical'
      ? 'CRITICO'
      : input.severity === 'warning'
        ? 'AVISO'
        : 'RECUPERADO';
  const clock = new Date().toLocaleString();
  return [
    `${title} · DAX-HULP`,
    input.message,
    `Tipo: ${input.kind}`,
    `Hora: ${clock}`,
  ].join('\n');
}

export function getNotifierStatus() {
  const whatsapp = describeWhatsApp();
  return {
    channel: 'whatsapp',
    ...whatsapp,
    last_error: lastDispatchError,
    last_sent_at: lastDispatchAt,
  };
}

export async function recordStatusTransition(input: {
  targetId: number;
  fromStatus: string | null;
  toStatus: string;
  message: string;
  kind: AlertKind;
  severity: AlertSeverity;
}): Promise<{ eventId: number; dispatched: boolean }> {
  const event = await prisma.opsAlertEvent.create({
    data: {
      targetId: input.targetId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      message: input.message.slice(0, 500),
      kind: input.kind,
      severity: input.severity,
      notificationStatus: 'pending',
      channel: 'whatsapp',
    },
  });

  const dispatched = await dispatchAlert(event.eventId, input);
  return { eventId: event.eventId, dispatched };
}

export async function sendTestWhatsAppAlert(): Promise<{ sent: boolean; to: string[] }> {
  const settings = getWhatsAppSettings();
  const status = describeWhatsApp(settings);
  if (!status.configured) {
    throw new Error(`WhatsApp is not configured. Missing: ${status.missing.join(', ')}`);
  }

  const body = formatWhatsAppMessage({
    severity: 'critical',
    kind: 'offline',
    message: 'Prueba DAX-HULP: alerta de servidor / target (mensaje de demostracion).',
  });

  await sendWhatsAppText(body, settings);
  lastDispatchError = null;
  lastDispatchAt = new Date();
  return { sent: true, to: status.to };
}

export async function dispatchAlert(
  eventId: number,
  input: { targetId?: number; kind: AlertKind; severity: AlertSeverity; message: string },
): Promise<boolean> {
  const settings = getWhatsAppSettings();
  const status = describeWhatsApp(settings);

  if (!settings.enabled) {
    await prisma.opsAlertEvent.update({
      where: { eventId },
      data: {
        notificationStatus: 'skipped',
        notificationError: 'OPS_ALERT_CHANNEL is not whatsapp',
      },
    });
    return false;
  }

  if (!settings.kinds.includes(input.kind)) {
    await prisma.opsAlertEvent.update({
      where: { eventId },
      data: {
        notificationStatus: 'skipped',
        notificationError: `Kind ${input.kind} is not in OPS_WHATSAPP_KINDS`,
      },
    });
    return false;
  }

  if (!status.configured) {
    lastDispatchError = `Missing ${status.missing.join(', ')}`;
    await prisma.opsAlertEvent.update({
      where: { eventId },
      data: {
        notificationStatus: 'skipped',
        notificationError: lastDispatchError.slice(0, 300),
      },
    });
    return false;
  }

  const cooldownKey = `${input.targetId ?? 'test'}:${input.kind}`;
  const previous = lastSentAt.get(cooldownKey) ?? 0;
  if (Date.now() - previous < settings.cooldownSec * 1000 && input.kind !== 'recovered') {
    await prisma.opsAlertEvent.update({
      where: { eventId },
      data: {
        notificationStatus: 'skipped',
        notificationError: `Cooldown ${settings.cooldownSec}s`,
      },
    });
    return false;
  }

  try {
    await sendWhatsAppText(formatWhatsAppMessage(input), settings);
    lastSentAt.set(cooldownKey, Date.now());
    lastDispatchError = null;
    lastDispatchAt = new Date();
    await prisma.opsAlertEvent.update({
      where: { eventId },
      data: {
        channel: 'whatsapp',
        notificationStatus: 'sent',
        notificationError: null,
      },
    });
    return true;
  } catch (error) {
    lastDispatchError = error instanceof Error ? error.message : 'WhatsApp send failed';
    await prisma.opsAlertEvent.update({
      where: { eventId },
      data: {
        channel: 'whatsapp',
        notificationStatus: 'failed',
        notificationError: lastDispatchError.slice(0, 300),
      },
    });
    return false;
  }
}

export function classifyTransition(
  fromStatus: string | null,
  toStatus: string,
): { kind: AlertKind; severity: AlertSeverity } | null {
  if (fromStatus === toStatus) return null;
  if (toStatus === 'offline') return { kind: 'offline', severity: 'critical' };
  if (toStatus === 'degraded' && fromStatus === 'online') {
    return { kind: 'degraded', severity: 'warning' };
  }
  if ((fromStatus === 'offline' || fromStatus === 'degraded') && toStatus === 'online') {
    return { kind: 'recovered', severity: 'recovered' };
  }
  return null;
}
