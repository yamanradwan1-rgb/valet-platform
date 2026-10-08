'use client';

import React, { useEffect, useRef, useState } from 'react';

import { Btn } from '../../components/primitives/btn';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { useTranslation } from '../../i18n/use-translation';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import { C } from '../../lib/theme/colors';
import { GuestRatingSubmission, type RatingOutcome } from './guest-rating-submission';

interface ScopedOutcome {
  readonly client: GuestApiClient;
  readonly visitId: string;
  readonly value: RatingOutcome;
}

const starLabelKeys = [
  'rating.star1',
  'rating.star2',
  'rating.star3',
  'rating.star4',
  'rating.star5',
] as const;

/** T5 real-authority rating flow. Not mounted in production until the UI delta is approved. */
export function GuestLiveRating({ client, visitId, canRate, onBack }: {
  readonly client: GuestApiClient | null;
  readonly visitId: string | null;
  readonly canRate: boolean;
  readonly onBack: () => void;
}) {
  const { t } = useTranslation();
  const [stars, setStars] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<ScopedOutcome | null>(null);
  const submission = useRef(new GuestRatingSubmission());

  useEffect(() => {
    const controller = submission.current;
    controller.invalidate();
    return () => { controller.invalidate(); };
  }, [client, visitId]);

  // Render-time scope fence: even before effect cleanup, old-visit success can
  // never be represented as success for another client/browser generation.
  const visible = client && visitId && outcome?.client === client && outcome.visitId === visitId
    ? outcome.value : 'idle';
  const locked = !canRate || !client || !visitId ||
    visible === 'saving' || visible === 'saved' || visible === 'unknown' ||
    visible === 'conflict' || visible === 'unavailable';

  const submit = async () => {
    if (locked || stars === null || !client || !visitId) return;
    await submission.current.submit(client, visitId, stars, (value) => {
      setOutcome({ client, visitId, value });
    });
  };

  const feedback = !canRate || visible === 'unavailable' ? 'rating.unavailable' : visible === 'saved' ? 'rating.saved'
    : visible === 'unknown' ? 'rating.unknown'
      : visible === 'conflict' ? 'rating.conflict'
        : visible === 'failed' ? 'rating.failed' : null;

  return (
    <div className="screen-enter" style={{ padding: '24px 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionTitle>{t('rating.liveTitle')}</SectionTitle>
      <div role="group" aria-label={t('rating.liveTitle')}
        style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} type="button" onClick={() => setStars(star)} disabled={locked}
            aria-label={t(starLabelKeys[star - 1]!)}
            aria-pressed={stars === star}
            style={{ background: 'none', border: 'none', fontSize: 32,
              cursor: locked ? 'not-allowed' : 'pointer',
              color: stars !== null && star <= stars ? C.warningSemantic : C.borderSemantic }}>
            ★
          </button>
        ))}
      </div>
      {feedback && (
        <p role="status" aria-live="polite" style={{ margin: 0, color: C.textSecondary, fontSize: 14 }}>
          {t(feedback)}
        </p>
      )}
      <Btn onClick={() => void submit()} disabled={locked || stars === null} loading={visible === 'saving'}>
        {visible === 'saving' ? t('rating.submitting') : t('rating.submit')}
      </Btn>
      <Btn variant="secondary" onClick={onBack}>{t('common.back')}</Btn>
    </div>
  );
}
