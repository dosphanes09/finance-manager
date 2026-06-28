export const CATEGORIES = [
  { id: "groceries", label: "Groceries", color: "#22c55e" },
  { id: "food", label: "Food & Dining", color: "#f97316" },
  { id: "transportation", label: "Transportation", color: "#3b82f6" },
  { id: "bills", label: "Bills & Utilities", color: "#a855f7" },
  { id: "subscriptions", label: "Subscriptions", color: "#06b6d4" },
  { id: "shopping", label: "Shopping", color: "#ec4899" },
  { id: "education", label: "Education", color: "#eab308" },
  { id: "health", label: "Health & Fitness", color: "#14b8a6" },
  { id: "entertainment", label: "Entertainment", color: "#f43f5e" },
  { id: "rent", label: "Rent & Housing", color: "#6366f1" },
  { id: "income", label: "Income", color: "#10b981" },
  { id: "other", label: "Other", color: "#94a3b8" },
] as const;

export type Category = (typeof CATEGORIES)[number];
export type CategoryId = Category["id"];

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((category) => category.id));
const CATEGORY_BY_ID = new Map<string, Category>(CATEGORIES.map((category) => [category.id, category]));

const LEGACY_CATEGORY_ALIASES: Record<string, CategoryId> = {
  "food & dining": "food",
  "food and dining": "food",
  food_dining: "food",
  dining: "food",
  restaurant: "food",
  restaurants: "food",
  "bills & utilities": "bills",
  "bills and utilities": "bills",
  bills_utilities: "bills",
  utilities: "bills",
  "health & fitness": "health",
  "health and fitness": "health",
  health_fitness: "health",
  fitness: "health",
  "rent & housing": "rent",
  "rent and housing": "rent",
  rent_housing: "rent",
  housing: "rent",
};

export function isCanonicalCategoryId(value: string | null | undefined): value is CategoryId {
  return typeof value === "string" && CATEGORY_IDS.has(value);
}

export function normalizeCategoryText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

export function normalizeCategoryId(value: string | null | undefined): CategoryId {
  if (!value) return "other";

  const trimmed = value.trim();
  if (isCanonicalCategoryId(trimmed)) return trimmed;

  const labelKey = trimmed.toLowerCase();
  if (labelKey in LEGACY_CATEGORY_ALIASES) return LEGACY_CATEGORY_ALIASES[labelKey];

  const normalized = normalizeCategoryText(trimmed);
  if (isCanonicalCategoryId(normalized)) return normalized;
  if (normalized in LEGACY_CATEGORY_ALIASES) return LEGACY_CATEGORY_ALIASES[normalized];

  const categoryByLabel = CATEGORIES.find((category) => normalizeCategoryText(category.label) === normalized);
  return categoryByLabel?.id ?? "other";
}

export function getCategoryById(value: string | null | undefined): Category {
  return CATEGORY_BY_ID.get(normalizeCategoryId(value)) ?? CATEGORY_BY_ID.get("other")!;
}

export function getCategoryLabel(value: string | null | undefined): string {
  return getCategoryById(value).label;
}

export function getCategoryColor(value: string | null | undefined): string {
  return getCategoryById(value).color;
}
