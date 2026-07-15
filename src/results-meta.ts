/**
 * The OpenMRS order has a single free-text field we control — fulfillerComment.
 * OpenMRS does not natively track who completed or who validated an order
 * (the fulfillerdetails endpoint does not even set auditInfo.changedBy), so we
 * encode that metadata as line markers inside the comment:
 *
 *   [PENDING_REVIEW]
 *   [DONE_BY:Dr Jean Dupont]
 *   [VALIDATED_BY:Dr Marie Curie]
 *   <free-text report follows on the remaining lines>
 *
 * parseResultComment() pulls these back out for display; buildResultComment()
 * writes them. The PENDING_REVIEW marker is always emitted first so the legacy
 * `startsWith(PENDING_REVIEW_MARKER)` checks keep working.
 */

export const PENDING_REVIEW_MARKER = '[PENDING_REVIEW]';

const DONE_BY_RE = /^\[DONE_BY:(.*)\]$/;
const VALIDATED_BY_RE = /^\[VALIDATED_BY:(.*)\]$/;
const START_RE = /^\[START:(.*)\]$/;
const END_RE = /^\[END:(.*)\]$/;
const OUTCOME_RE = /^\[OUTCOME:(.*)\]$/;
const PARTICIPANTS_RE = /^\[PARTICIPANTS:(.*)\]$/;
const COMPLICATIONS_RE = /^\[COMPLICATIONS:(.*)\]$/;

/** Separator between list values inside a marker; must not appear in names. */
const LIST_SEP = ' ; ';

export interface ResultMeta {
  pendingReview: boolean;
  doneBy: string | null;
  validatedBy: string | null;
  /** Procedure results: ISO date-times of the procedure start / end. */
  startDatetime: string | null;
  endDatetime: string | null;
  /** Procedure outcome label (e.g. "Réussi"). */
  outcome: string | null;
  /** Display names of the participating users. */
  participants: string[];
  /** Free-text description of the complications. */
  complications: string | null;
  report: string;
}

function splitList(raw: string): string[] {
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseResultComment(comment: string | null | undefined): ResultMeta {
  const meta: ResultMeta = {
    pendingReview: false,
    doneBy: null,
    validatedBy: null,
    startDatetime: null,
    endDatetime: null,
    outcome: null,
    participants: [],
    complications: null,
    report: '',
  };
  if (!comment) return meta;
  const reportLines: string[] = [];
  const simpleMarkers: Array<[RegExp, (v: string) => void]> = [
    [DONE_BY_RE, (v) => (meta.doneBy = v || null)],
    [VALIDATED_BY_RE, (v) => (meta.validatedBy = v || null)],
    [START_RE, (v) => (meta.startDatetime = v || null)],
    [END_RE, (v) => (meta.endDatetime = v || null)],
    [OUTCOME_RE, (v) => (meta.outcome = v || null)],
    [PARTICIPANTS_RE, (v) => (meta.participants = splitList(v))],
    [COMPLICATIONS_RE, (v) => (meta.complications = v || null)],
  ];
  for (const line of comment.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === PENDING_REVIEW_MARKER) {
      meta.pendingReview = true;
      continue;
    }
    const matched = simpleMarkers.some(([re, apply]) => {
      const m = trimmed.match(re);
      if (m) apply(m[1].trim());
      return !!m;
    });
    if (!matched) reportLines.push(line);
  }
  meta.report = reportLines.join('\n').trim();
  return meta;
}

export function buildResultComment(meta: {
  pendingReview?: boolean;
  doneBy?: string | null;
  validatedBy?: string | null;
  startDatetime?: string | null;
  endDatetime?: string | null;
  outcome?: string | null;
  participants?: string[];
  complications?: string | null;
  report?: string;
}): string | undefined {
  const parts: string[] = [];
  if (meta.pendingReview) parts.push(PENDING_REVIEW_MARKER);
  if (meta.doneBy) parts.push(`[DONE_BY:${meta.doneBy}]`);
  if (meta.validatedBy) parts.push(`[VALIDATED_BY:${meta.validatedBy}]`);
  if (meta.startDatetime) parts.push(`[START:${meta.startDatetime}]`);
  if (meta.endDatetime) parts.push(`[END:${meta.endDatetime}]`);
  if (meta.outcome) parts.push(`[OUTCOME:${meta.outcome}]`);
  if (meta.participants?.length) parts.push(`[PARTICIPANTS:${meta.participants.join(LIST_SEP)}]`);
  // Markers are line-based, so flatten any newlines in the free text.
  if (meta.complications?.trim()) parts.push(`[COMPLICATIONS:${meta.complications.trim().replace(/\s*\n+\s*/g, ' ; ')}]`);
  const report = (meta.report ?? '').trim();
  if (report) parts.push(report);
  const result = parts.join('\n');
  return result.length ? result : undefined;
}

export function isPendingReviewComment(comment: string | null | undefined): boolean {
  return parseResultComment(comment).pendingReview;
}
