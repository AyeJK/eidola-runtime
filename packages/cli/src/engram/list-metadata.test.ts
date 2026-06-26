import { describe, expect, it } from 'vitest';

import {
  humanizeEngramFolderId,
  parseLooseEngramMetadata,
  parseLooseVesselPreview,
} from './list-metadata.js';

describe('parseLooseEngramMetadata', () => {
  it('reads name and meta without strict schema fields', () => {
    const metadata = parseLooseEngramMetadata({
      name: 'Caveman',
      meta: {
        author: 'Jeremy Kaye',
        description: 'Direct assistant',
      },
    });

    expect(metadata).toEqual({
      name: 'Caveman',
      author: 'Jeremy Kaye',
      description: 'Direct assistant',
    });
  });
});

describe('parseLooseVesselPreview', () => {
  it('reads idle clip from a lottie vessel', () => {
    const preview = parseLooseVesselPreview({
      type: 'lottie',
      pack: 'caveman-v1',
      expressions: {
        idle: 'idle.json',
      },
    });

    expect(preview).toEqual({
      vesselType: 'lottie',
      pack: 'caveman-v1',
      idleClip: 'idle.json',
    });
  });

  it('uses fallback pack for component vessels', () => {
    const preview = parseLooseVesselPreview({
      type: 'component',
      pack: 'ignored',
      fallback: {
        type: 'webm',
        pack: 'caveman-v1',
        expressions: {
          idle: 'idle.webm',
        },
      },
    });

    expect(preview).toEqual({
      vesselType: 'webm',
      pack: 'caveman-v1',
      idleClip: 'idle.webm',
    });
  });
});

describe('humanizeEngramFolderId', () => {
  it('derives a display name from release folder ids', () => {
    expect(humanizeEngramFolderId('caveman-engram-1.0.0')).toBe('Caveman');
  });
});
