// Pure types + helpers for the semantic-validator JSON. Lives in its
// own file so client components can import the type and the
// isErrorCode helper without dragging better-sqlite3 (and its `fs`
// dependency) into the browser bundle via db.ts.

export type SemanticIssue = {
  code: string;
  clip_id: string;
  window: [number, number] | null;
  message: string;
};

export type SemanticIssueReport = {
  pass_id: string;
  generated_at: string;
  summary: { total: number; errors: number; warnings: number; by_code: Record<string, number> };
  issues: SemanticIssue[];
};

const ERROR_CODES = new Set([
  "CHRONOLOGY_ERROR",
  "VO_CUTOFF_ERROR",
  "MISSING_TIMELINE_START_ERROR",
]);

export function isErrorCode(code: string): boolean {
  return ERROR_CODES.has(code);
}
