import type { SupabaseClient } from "@supabase/supabase-js";

import { logError } from "@/lib/logger";

export interface GradeWriteRecord {
  session_id: string;
  q_idx: number;
  score: number;
  comment?: string | null;
  stage_grading?: unknown;
  grade_type?: string;
  updated_at?: string;
}

interface ExistingGradeRow {
  id: string;
  q_idx: number;
  created_at?: string | null;
  grade_type?: string | null;
}

const DEFAULT_SELECT = "id, q_idx";

function getGradeTypePriority(gradeType?: string | null): number {
  switch (gradeType) {
    case "manual":
      return 0;
    case "auto":
      return 1;
    case "ai_failed":
      return 2;
    default:
      return 3;
  }
}

function normalizeGradeRecords(records: GradeWriteRecord[]): GradeWriteRecord[] {
  const deduped = new Map<string, GradeWriteRecord>();

  for (const record of records) {
    deduped.set(`${record.session_id}:${record.q_idx}`, record);
  }

  return Array.from(deduped.values());
}

export function isMissingGradesConflictConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: string; message?: string };

  return (
    candidate.code === "42P10" ||
    candidate.message?.includes(
      "there is no unique or exclusion constraint matching the ON CONFLICT specification"
    ) === true
  );
}

export async function persistGrades(
  supabase: SupabaseClient,
  records: GradeWriteRecord[],
  options?: { select?: string }
): Promise<Array<Record<string, unknown>>> {
  if (records.length === 0) return [];

  const normalizedRecords = normalizeGradeRecords(records);
  const selectClause = options?.select || DEFAULT_SELECT;

  const upsertResult = await supabase
    .from("grades")
    .upsert(normalizedRecords, { onConflict: "session_id,q_idx" })
    .select(selectClause);

  if (!upsertResult.error) {
    return ((upsertResult.data as unknown) as Array<Record<string, unknown>> | null) ?? [];
  }

  if (!isMissingGradesConflictConstraint(upsertResult.error)) {
    throw upsertResult.error;
  }

  const sessionIds = new Set(normalizedRecords.map((record) => record.session_id));
  if (sessionIds.size !== 1) {
    throw new Error("persistGrades fallback only supports a single session_id per call");
  }

  const sessionId = normalizedRecords[0].session_id;
  const qIdxs = normalizedRecords.map((record) => record.q_idx);

  await logError(
    "[GRADES] Falling back to select/update/insert because grades unique constraint is missing",
    upsertResult.error,
    {
      path: "lib/grade-persistence.ts",
      additionalData: { sessionId, qIdxs },
    }
  );

  const existingResult = await supabase
    .from("grades")
    .select("id, q_idx, created_at, grade_type")
    .eq("session_id", sessionId)
    .in("q_idx", qIdxs);

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existingByQuestion = new Map<number, ExistingGradeRow[]>();
  for (const row of (existingResult.data as ExistingGradeRow[] | null) ?? []) {
    const rows = existingByQuestion.get(row.q_idx) ?? [];
    rows.push(row);
    existingByQuestion.set(row.q_idx, rows);
  }

  const keeperByQuestion = new Map<number, ExistingGradeRow>();
  const duplicateIds: string[] = [];

  for (const [qIdx, rows] of existingByQuestion.entries()) {
    const sortedRows = [...rows].sort((left, right) => {
      const typePriorityDiff =
        getGradeTypePriority(left.grade_type) - getGradeTypePriority(right.grade_type);
      if (typePriorityDiff !== 0) return typePriorityDiff;

      const createdAtDiff =
        new Date(right.created_at ?? 0).getTime() -
        new Date(left.created_at ?? 0).getTime();
      if (createdAtDiff !== 0) return createdAtDiff;

      return right.id.localeCompare(left.id);
    });

    keeperByQuestion.set(qIdx, sortedRows[0]);
    duplicateIds.push(...sortedRows.slice(1).map((row) => row.id));
  }

  if (duplicateIds.length > 0) {
    const deleteResult = await supabase.from("grades").delete().in("id", duplicateIds);
    if (deleteResult.error) {
      throw deleteResult.error;
    }
  }

  const rowsByQuestion = new Map<number, Record<string, unknown>>();
  const insertRecords: GradeWriteRecord[] = [];

  for (const record of normalizedRecords) {
    const existingRow = keeperByQuestion.get(record.q_idx);

    if (!existingRow) {
      insertRecords.push(record);
      continue;
    }

    const updateResult = await supabase
      .from("grades")
      .update(record)
      .eq("id", existingRow.id)
      .select(selectClause);

    if (updateResult.error) {
      throw updateResult.error;
    }

    const updatedRow =
      (((updateResult.data as unknown) as Array<Record<string, unknown>> | null) ?? [])[0];
    if (updatedRow) {
      rowsByQuestion.set(record.q_idx, updatedRow);
    }
  }

  if (insertRecords.length > 0) {
    const insertResult = await supabase
      .from("grades")
      .insert(insertRecords)
      .select(selectClause);

    if (insertResult.error) {
      throw insertResult.error;
    }

    for (const insertedRow of
      (((insertResult.data as unknown) as Array<Record<string, unknown>> | null) ?? [])) {
      const qIdx =
        typeof insertedRow.q_idx === "number"
          ? insertedRow.q_idx
          : Number(insertedRow.q_idx);
      if (!Number.isNaN(qIdx)) {
        rowsByQuestion.set(qIdx, insertedRow);
      }
    }
  }

  return normalizedRecords
    .map((record) => rowsByQuestion.get(record.q_idx))
    .filter((row): row is Record<string, unknown> => Boolean(row));
}
