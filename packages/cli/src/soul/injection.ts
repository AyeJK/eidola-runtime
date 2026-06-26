export interface SoulInjectionMessage {
  role: 'user';
  content: string;
}

export interface SoulInjectionPayload {
  type: 'soul_injection';
  engram_id: string;
  messages: SoulInjectionMessage[];
}

const SYSTEM_REMINDER_OPEN = '<system-reminder>';
const SYSTEM_REMINDER_CLOSE = '</system-reminder>';

export function wrapSoulAsSystemReminder(soul: string): string {
  const prose = soul.replace(/\r\n/g, '\n').trim();
  return `${SYSTEM_REMINDER_OPEN}\n${prose}\n${SYSTEM_REMINDER_CLOSE}`;
}

export function buildSoulInjectionPayload(engramId: string, soul: string): SoulInjectionPayload {
  return {
    type: 'soul_injection',
    engram_id: engramId,
    messages: [
      {
        role: 'user',
        content: wrapSoulAsSystemReminder(soul),
      },
    ],
  };
}

export function isValidSoulInjectionPayload(value: unknown): value is SoulInjectionPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as SoulInjectionPayload;
  if (payload.type !== 'soul_injection' || typeof payload.engram_id !== 'string') {
    return false;
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return false;
  }

  const first = payload.messages[0];
  if (first.role !== 'user' || typeof first.content !== 'string') {
    return false;
  }

  return (
    first.content.startsWith(SYSTEM_REMINDER_OPEN) && first.content.endsWith(SYSTEM_REMINDER_CLOSE)
  );
}
