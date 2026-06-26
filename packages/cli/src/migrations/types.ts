/**
 * Legacy pre-rebuild `.engram.json` blob shape (PersonaModel v1.x lineage).
 * Migration reads this format and outputs a directory package without mutating source.
 */
export interface LegacyEngramMetadata {
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  license?: string;
  builtIn?: boolean;
  sample?: boolean;
}

export interface LegacyVoiceConfig {
  enabled?: boolean;
  provider?: string;
  voiceId?: string;
}

export interface LegacyVesselSpec {
  name?: string;
  appearance?: string | null;
  mannerisms?: Record<string, string>;
}

export interface LegacyPackRef {
  packId?: string;
  sourceType?: 'lottie' | 'webm' | 'gif';
}

export interface LegacyEngramJson {
  version?: string;
  id?: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  soulMd?: string;
  styleRules?: string[];
  behaviorRules?: string[];
  states?: string[];
  packId?: string;
  vessel?: LegacyVesselSpec | LegacyPackRef | null;
  voice?: LegacyVoiceConfig | null;
  metadata?: LegacyEngramMetadata;
  extensions?: Record<string, unknown>;
  expressions?: Record<string, string>;
}
