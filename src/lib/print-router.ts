import { db } from "@/lib/db";

export type JobType = "dining_kot" | "takeaway_kot" | "dining_bill" | "takeaway_bill" | "report";

/**
 * Route a print job through Supabase to the Windows hub agent.
 * Returns true if the job was queued, null if no printer is assigned (caller should fall back to browser print).
 */
export async function routePrintJob(opts: {
  restaurantId: string;
  jobType: JobType;
  payload: unknown;
  idempotencyKey?: string;
}): Promise<true | null> {
  const { data: assignment } = await db
    .from("printer_assignments")
    .select("device_id, copies")
    .eq("restaurant_id", opts.restaurantId)
    .eq("job_type", opts.jobType)
    .maybeSingle();

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
