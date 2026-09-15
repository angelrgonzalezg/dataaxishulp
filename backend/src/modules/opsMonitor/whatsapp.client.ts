export interface WhatsAppSettings {
  enabled: boolean;
  provider: 'cloud' | 'http';
  to: string[];
  cooldownSec: number;
  kinds: string[];
  token: string | null;
  phoneNumberId: string | null;
  graphVersion: string;
  apiUrl: string | null;
  apiKey: string | null;
  template: string | null;
  templateLanguage: string;
}

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeWhatsAppNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  return digits;
}

export function getWhatsAppSettings(): WhatsAppSettings {
  const to = csv(process.env.OPS_WHATSAPP_TO || '+59995262686').map(normalizeWhatsAppNumber);
  const kinds = csv(process.env.OPS_WHATSAPP_KINDS || 'offline,degraded,recovered');
  const cooldownRaw = Number(process.env.OPS_WHATSAPP_COOLDOWN_SEC ?? '600');
  const provider = (process.env.OPS_WHATSAPP_PROVIDER?.trim() || 'cloud').toLowerCase() === 'http'
    ? 'http'
    : 'cloud';

  return {
    enabled: (process.env.OPS_ALERT_CHANNEL?.trim() || 'whatsapp').toLowerCase() === 'whatsapp',
    provider,
    to,
    cooldownSec: Number.isFinite(cooldownRaw) && cooldownRaw >= 0 ? cooldownRaw : 600,
    kinds,
    token: process.env.OPS_WHATSAPP_TOKEN?.trim() || null,
    phoneNumberId: process.env.OPS_WHATSAPP_PHONE_NUMBER_ID?.trim() || null,
    graphVersion: process.env.OPS_WHATSAPP_GRAPH_VERSION?.trim() || 'v21.0',
    apiUrl: process.env.OPS_WHATSAPP_API_URL?.trim() || null,
    apiKey: process.env.OPS_WHATSAPP_API_KEY?.trim() || null,
    template: process.env.OPS_WHATSAPP_TEMPLATE?.trim() || null,
    templateLanguage: process.env.OPS_WHATSAPP_TEMPLATE_LANG?.trim() || 'en_US',
  };
}

export function describeWhatsApp(settings = getWhatsAppSettings()): {
  configured: boolean;
  provider: string;
  to: string[];
  missing: string[];
} {
  const missing: string[] = [];
  if (settings.provider === 'cloud') {
    if (!settings.token) missing.push('OPS_WHATSAPP_TOKEN');
    if (!settings.phoneNumberId) missing.push('OPS_WHATSAPP_PHONE_NUMBER_ID');
  } else if (!settings.apiUrl) {
    missing.push('OPS_WHATSAPP_API_URL');
  }
  if (settings.to.length === 0) missing.push('OPS_WHATSAPP_TO');

  return {
    configured: settings.enabled && missing.length === 0,
    provider: settings.provider,
    to: settings.to.map((number) => `+${number}`),
    missing,
  };
}

export async function sendWhatsAppText(body: string, settings = getWhatsAppSettings()): Promise<void> {
  if (settings.to.length === 0) {
    throw new Error('No WhatsApp recipients configured (OPS_WHATSAPP_TO)');
  }

  const errors: string[] = [];
  for (const to of settings.to) {
    try {
      if (settings.provider === 'http') {
        await sendViaHttp(to, body, settings);
      } else {
        await sendViaCloud(to, body, settings);
      }
    } catch (error) {
      errors.push(`${to}: ${error instanceof Error ? error.message : 'send failed'}`);
    }
  }

  if (errors.length) {
    throw new Error(errors.join(' | ').slice(0, 400));
  }
}

async function sendViaCloud(to: string, body: string, settings: WhatsAppSettings): Promise<void> {
  if (!settings.token || !settings.phoneNumberId) {
    throw new Error('WhatsApp Cloud API is missing OPS_WHATSAPP_TOKEN or OPS_WHATSAPP_PHONE_NUMBER_ID');
  }

  const url = `https://graph.facebook.com/${settings.graphVersion}/${settings.phoneNumberId}/messages`;
  const payload = settings.template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: settings.template,
          language: { code: settings.templateLanguage },
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body: body.slice(0, 4096) },
      };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  const json = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(json?.error?.message || `WhatsApp Cloud HTTP ${response.status}`);
  }
}

async function sendViaHttp(to: string, body: string, settings: WhatsAppSettings): Promise<void> {
  if (!settings.apiUrl) {
    throw new Error('OPS_WHATSAPP_API_URL is not configured');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
    headers.apikey = settings.apiKey;
  }

  const response = await fetch(settings.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number: to,
      to,
      phone: to,
      text: body,
      message: body,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text.slice(0, 240) || `WhatsApp HTTP ${response.status}`);
  }
}
