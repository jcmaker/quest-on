import { logError } from "@/lib/logger";

type GradeRow = {
  session_id: string;
  q_idx: number;
  [key: string]: unknown;
};

function isOnConflictConstraintError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const message = e?.message || "";
  return (
    e?.code === "42P10" ||
    /no unique or exclusion constraint matching the ON CONFLICT specification/i.test(
      message
    )
  );
}

/**
 * Upsert grades by (session_id, q_idx).
 * Falls back to update-then-insert when DB is missing the unique constraint.
 */
export async function upsertGradesBySessionQuestion(
  supabase: {
    from: (table: string) => {
      upsert: (
        values: GradeRow[],
        options: { onConflict: string }
      ) => {
        select: (
          columns: string
        ) => Promise<{ data: Array<{ q_idx: number }> | null; error: unknown }>;
      };
      update: (value: GradeRow) => {
        eq: (column: string, value: string | number) => {
          eq: (column: string, value: string | number) => {
            select: (
              columns: string
            ) => Promise<{ data: Array<{ q_idx: number }> | null; error: unknown }>;
          };
        };
      };
      insert: (value: GradeRow) => {
        select: (
          columns: string
        ) => {
          single: () => Promise<{ data: { q_idx: number } | null; error: unknown }>;
        };
      };
    };
  },
  rows: GradeRow[],
  source: string
): Promise<number[]> {
  if (rows.length === 0) return [];

  const { data: upsertRows, error: upsertError } = await supabase
    .from("grades")
    .upsert(rows, { onConflict: "session_id,q_idx" })
    .select("q_idx");

  if (!upsertError) {
    return (upsertRows || []).map((row) => row.q_idx);
  }

  if (!isOnConflictConstraintError(upsertError)) {
    throw upsertError;
  }

  logError("[GRADES_UPSERT] Missing onConflict constraint, using fallback path", upsertError, {
    path: "lib/grades-upsert.ts",
    additionalData: { source, rows: rows.length },
  });

  const qIdxs: number[] = [];
  for (const row of rows) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("grades")
      .update(row)
      .eq("session_id", row.session_id)
      .eq("q_idx", row.q_idx)
      .select("q_idx");

    if (updateError) throw updateError;

    if (updatedRows && updatedRows.length > 0) {
      qIdxs.push(row.q_idx);
      continue;
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from("grades")
      .insert(row)
      .select("q_idx")
      .single();

    if (insertError) throw insertError;
    if (insertedRow) qIdxs.push(insertedRow.q_idx);
  }

  return qIdxs;
}
