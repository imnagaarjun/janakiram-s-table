import { db } from "@/lib/db";

export type JobType = "dining_kot" | "takeaway_kot" | "dining_bill" | "takeaway_bill" | "report";

type ResolvedAssignment = { device_id: string | null; copies: number | null };

/**
 * Find the printer assignment for a job, preferring a section-specific assignment
 * and falling back to the restaurant-wide default (section_id IS NULL).
 */
async function findAssignment(
  restaurantId: string,
  jobType: JobType,
  sectionId: string | null | undefined,
): Promise<ResolvedAssignment | null> {
  if (sectionId) {
    const { data } = await db
      .from("printer_assignments")
      .select("device_id, copies")
      .eq("restaurant_id", restaurantId)
      .eq("job_type", jobType)
      .eq("section_id", sectionId)
      .maybeSingle();
    if (data?.device_id) return data as ResolvedAssignment;
  }
  const { data } = await db
    .from("printer_assignments")
    .select("device_id, copies")
    .eq("restaurant_id", restaurantId)
    .eq("job_type", jobType)
    .is("section_id", null)
    .maybeSingle();
  return (data as ResolvedAssignment | null) ?? null;
}

/**
 * Route a print job through Supabase to the Windows hub agent.
 * Routing depends on the job type and the user's section (if any).
 * Returns true if the job was queued, null if no printer is assigned (caller should fall back to browser print).
 */
export async function routePrintJob(opts: {
  restaurantId: string;
  jobType: JobType;
  payload: unknown;
  sectionId?: string | null;
  idempotencyKey?: string;
}): Promise<true | null> {
  const assignment = await findAssignment(opts.restaurantId, opts.jobType, opts.sectionId);

  if (!assignment?.device_id) return null;

  const { error } = await db.from("print_jobs").insert({
    restaurant_id: opts.restaurantId,
    device_id: assignment.device_id,
    job_type: opts.jobType,
    payload: opts.payload as Record<string, unknown>,
    copies: assignment.copies ?? 1,
    idempotency_key: opts.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return true;
}
