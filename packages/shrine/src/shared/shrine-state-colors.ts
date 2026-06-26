/** Shrine LCD background colors per conversation state. */
export const SHRINE_STATE_COLORS: Record<string, string> = {
  idle: '#c9a84c',
  thinking: '#b29e58',
  waiting: '#7896a8',
  working: '#da8a3a',
  searching: '#449eb2',
  writing: '#76a862',
  responding: '#eed04e',
  success: '#a8c850',
  error: '#9e76c6',
  attention: '#da302a',
};

export function shrineColorForState(state: string): string {
  return SHRINE_STATE_COLORS[state] ?? SHRINE_STATE_COLORS.idle;
}
