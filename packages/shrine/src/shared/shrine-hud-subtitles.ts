/** Shrine HUD subtitle copy per visual tier — curated, rotating flavor phrases, not raw broadcast debug text. */
export const SHRINE_HUD_SUBTITLES: Record<string, string[]> = {
  idle: ['standing by', 'idling', 'loitering', 'occupying space', 'still here', 'existing'],
  thinking: ['pondering', 'ruminating', 'noodling', 'cogitating'],
  waiting: ['awaiting signal', 'hovering', 'lingering', 'biding time'],
  working: ['schlepping', 'crunching', 'churning', 'hustling'],
  searching: ['scouring', 'rummaging', 'sleuthing', 'spelunking'],
  writing: ['composing', 'drafting', 'scribbling', 'penning'],
  responding: ['transmitting', 'broadcasting', 'relaying', 'replying'],
  success: ['celebrating', 'basking', 'partying', 'beaming'],
  error: ['stumbling', 'faltering', 'glitching', 'sputtering'],
  attention: ['nudging', 'flagging', 'beckoning', 'pestering'],
};

/** Pick a random subtitle for a visual tier, optionally avoiding an exact repeat. */
export function pickShrineHudSubtitle(visualTier: string, avoid?: string): string {
  const options = SHRINE_HUD_SUBTITLES[visualTier];
  if (!options || options.length === 0) {
    return '';
  }

  if (options.length === 1) {
    return options[0];
  }

  const pool = avoid ? options.filter((option) => option !== avoid) : options;
  const choices = pool.length > 0 ? pool : options;
  return choices[Math.floor(Math.random() * choices.length)];
}
