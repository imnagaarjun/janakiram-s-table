import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { getMenuImageUrl } from "@/lib/menu-storage";

export function MenuImage({
  path,
  alt,
  className,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    getMenuImageUrl(path).then((u) => !cancelled && setUrl(u));
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-accent text-muted-foreground ${className ?? ""}`}>
        <ImageIcon className="h-6 w-6 opacity-50" />
      </div>
    );
  }
  return <img src={url} alt={alt} className={`object-cover ${className ?? ""}`} loading="lazy" />;
}
