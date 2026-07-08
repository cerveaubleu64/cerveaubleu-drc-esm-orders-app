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

export interface ResultMeta {
  pendingReview: boolean;
  doneBy: string | null;
  validatedBy: string | null;
  report: string;
}

export function parseResultComment(comment: string | null | undefined): ResultMeta {
  const meta: ResultMeta = { pendingReview: false, doneBy: null, validatedBy: null, report: '' };
  if (!comment) return meta;
  const reportLines: string[] = [];
  for (const line of comment.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === PENDING_REVIEW_MARKER) {
      meta.pendingReview = true;
      continue;
    }
    const d = trimmed.match(DONE_BY_RE);
    if (d) {
      meta.doneBy = d[1].trim() || null;
      continue;
    }
    const v = trimmed.match(VALIDATED_BY_RE);
    if (v) {
      meta.validatedBy = v[1].trim() || null;
      continue;
    }
    reportLines.push(line);
  }
  meta.report = reportLines.join('\n').trim();
  return meta;
}

export function buildResultComment(meta: {
  pendingReview?: boolean;
  doneBy?: string | null;
  validatedBy?: string | null;
  report?: string;
}): string | undefined {
  const parts: string[] = [];
  if (meta.pendingReview) parts.push(PENDING_REVIEW_MARKER);
  if (meta.doneBy) parts.push(`[DONE_BY:${meta.doneBy}]`);
  if (meta.validatedBy) parts.push(`[VALIDATED_BY:${meta.validatedBy}]`);
  const report = (meta.report ?? '').trim();
  if (report) parts.push(report);
  const result = parts.join('\n');
  return result.length ? result : undefined;
}

export function isPendingReviewComment(comment: string | null | undefined): boolean {
  return parseResultComment(comment).pendingReview;
}
