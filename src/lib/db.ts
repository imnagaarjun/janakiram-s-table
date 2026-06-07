// Loose-typed Supabase client wrapper for tables not yet in generated types.
import { supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;
