import { supabase } from "@/integrations/supabase/client";

const urlCache = new Map<string, { url: string; exp: number }>();

export async function getMenuImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const now = Date.now();
  const cached = urlCache.get(path);
  if (cached && cached.exp > now) return cached.url;
  const { data } = await supabase.storage.from("menu").createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, exp: now + 50 * 60 * 1000 });
  return data.signedUrl;
}

export async function uploadMenuImage(
  restaurantId: string,
  scope: "category" | "item" | "staff",
  id: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${restaurantId}/${scope}/${id}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("menu")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}
