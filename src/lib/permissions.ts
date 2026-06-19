export interface PermArea {
  key: string;
  label: string;
  hasEdit: boolean;
}

export const PERMISSION_AREAS: PermArea[] = [
  { key: "tables",     label: "Tables & Ordering",         hasEdit: true  },
  { key: "menu",       label: "Menu Management",            hasEdit: true  },
  { key: "kds",        label: "Kitchen Display (KDS)",      hasEdit: true  },
  { key: "reports",    label: "Reports",                    hasEdit: false },
  { key: "stock",      label: "Daily Stock",                hasEdit: true  },
  { key: "waiters",    label: "Waiters & Allocation",       hasEdit: true  },
  { key: "vendors",    label: "Vendors & Products",         hasEdit: true  },
  { key: "purchases",  label: "Daily Purchases",            hasEdit: true  },
  { key: "cash-config",label: "Cash Reconciliation Setup",  hasEdit: true  },
  { key: "cash-recon", label: "Cash Reconciliation",        hasEdit: true  },
  { key: "billing",    label: "Billing & Payments",         hasEdit: true  },
  { key: "users",      label: "Staff Users",                hasEdit: true  },
  { key: "settings",   label: "Restaurant Settings",        hasEdit: true  },
];

// Keys granted to each role by default (mirrors current role-based access).
export const ROLE_DEFAULTS: Record<string, string[]> = {
  admin: PERMISSION_AREAS.flatMap((a) => a.hasEdit ? [`${a.key}:view`, `${a.key}:edit`] : [`${a.key}:view`]),
  manager: [
    "tables:view","tables:edit",
    "menu:view","menu:edit",
    "kds:view","kds:edit",
    "reports:view",
    "stock:view","stock:edit",
    "waiters:view","waiters:edit",
    "vendors:view","vendors:edit",
    "purchases:view","purchases:edit",
    "cash-config:view","cash-config:edit",
    "cash-recon:view","cash-recon:edit",
    "billing:view","billing:edit",
  ],
  cashier: [
    "tables:view","tables:edit",
    "menu:view",
    "kds:view","kds:edit",
    "reports:view",
    "purchases:view","purchases:edit",
    "cash-recon:view","cash-recon:edit",
    "billing:view","billing:edit",
  ],
  waiter: [
    "tables:view","tables:edit",
    "menu:view",
    "reports:view",
  ],
  kitchen: [
    "kds:view","kds:edit",
  ],
};

/** All permission keys that exist. */
const ALL_KEYS = new Set(
  PERMISSION_AREAS.flatMap((a) => a.hasEdit ? [`${a.key}:view`, `${a.key}:edit`] : [`${a.key}:view`]),
);

/**
 * Resolve the effective permission set for a user.
 * - Admins always get everything (cannot be locked out).
 * - Others start from their role's defaults, then apply any stored overrides.
 */
export function resolvePermissions(
  roles: string[],
  stored: Record<string, boolean> | null | undefined,
): Set<string> {
  if (roles.includes("admin")) return new Set(ALL_KEYS);

  // Union defaults for all of the user's roles
  const base = new Set<string>();
  for (const role of roles) {
    for (const key of ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.waiter) {
      base.add(key);
    }
  }

  // Apply overrides
  if (stored) {
    for (const [key, granted] of Object.entries(stored)) {
      if (!ALL_KEYS.has(key)) continue;
      if (granted) base.add(key);
      else base.delete(key);
    }
  }

  return base;
}
