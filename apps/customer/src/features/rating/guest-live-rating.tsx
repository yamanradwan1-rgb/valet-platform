'use client';

import React, { useEffect, useRef, useState } from 'react';
import { guestRatingScopedFeedbackRequestSchema } from '@valet/contracts';

import { Btn } from '../../components/primitives/btn';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { useTranslation } from '../../i18n/use-translation';
import { readBrowserContextMarker } from '../../lib/api/guest-browser-context-marker';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import { C } from '../../lib/theme/colors';
import { GuestRatingSubmission, type RatingOutcome } from './guest-rating-submission';
import styles from './guest-rating-comment.module.css';

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

const clientIds = new WeakMap<GuestApiClient, number>();
let nextClientId = 0;

function clientKey(client: GuestApiClient | null): number {
  if (!client) return 0;
  let id = clientIds.get(client);
  if (id === undefined) {
    id = ++nextClientId;
    clientIds.set(client, id);
  }
  return id;
}

interface RatingProps {
  readonly client: GuestApiClient | null;
  readonly visitId: string | null;
  readonly canRate: boolean;
  readonly onBack: () => void;
}

/** A new visit, client or browser-session marker mounts an empty draft immediately. */
export function GuestLiveRating(props: RatingProps) {
  const marker = typeof document !== 'undefined' && typeof document.cookie === 'string'
    ? readBrowserContextMarker() : null;
  const scope = `${clientKey(props.client)}:${props.visitId ?? ''}:${marker ?? ''}:${props.canRate}`;
  return <ScopedRatingForm key={scope} {...props} />;
}

function ScopedRatingForm({ client, visitId, canRate, onBack }: RatingProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [stars, setStars] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<ScopedOutcome | null>(null);
  const submission = useRef(new GuestRatingSubmission());

  useEffect(() => {
    const controller = submission.current;
    controller.invalidate();
    return () => { controller.invalidate(); };
  }, []);

  // Render-time scope fence: even before effect cleanup, old-visit success can
  // never be represented as success for another client/browser generation.
  const visible = client && visitId && outcome?.client === client && outcome.visitId === visitId
    ? outcome.value : 'idle';
  const locked = !canRate || !client || !visitId ||
    visible === 'saving' || visible === 'saved' || visible === 'unknown' ||
    visible === 'conflict' || visible === 'unavailable';

  const submit = async () => {
    if (locked || stars === null || !client || !visitId) return;
    const parsed = guestRatingScopedFeedbackRequestSchema.safeParse({
      rating: stars, expectedValetSessionId: visitId, comment,
    });
    if (!parsed.success) {
      setOutcome({ client, visitId, value: 'failed' });
      return;
    }
    await submission.current.submitFeedback(client, visitId, parsed.data.rating,
      parsed.data.comment ?? null, (value) => {
        setOutcome({ client, visitId, value });
      });
  };

  const back = () => {
    submission.current.invalidate();
    onBack();
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
      <div>
        <label className={styles.label} htmlFor="rating-comment">{t('rating.commentLabel')}</label>
        <textarea
          id="rating-comment"
          className={styles.comment}
          rows={3}
          value={comment}
          disabled={locked}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t('rating.commentPlaceholder')}
        />
      </div>
      {feedback && (
        <p role="status" aria-live="polite" style={{ margin: 0, color: C.textSecondary, fontSize: 14 }}>
          {t(feedback)}
        </p>
      )}
      <Btn onClick={() => void submit()} disabled={locked || stars === null} loading={visible === 'saving'}>
        {t('rating.submit')}
      </Btn>
      <Btn variant="secondary" onClick={back}>{t('common.back')}</Btn>
    </div>
  );
}
