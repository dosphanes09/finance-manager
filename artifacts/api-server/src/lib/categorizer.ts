const CATEGORY_RULES: Record<string, string[]> = {
  groceries: [
    "migros", "carrefour", "a101", "bim", "şok", "sok",
    "lidl", "aldi", "tesco", "sainsbury", "asda", "morrisons", "waitrose",
    "marks & spencer", "m&s food", "whole foods", "costco",
    "spar", "coop", "co-op", "iceland", "farmfoods", "budgens", "netto",
  ],
  food: [
    "yemeksepeti", "getir yemek", "getiryemek",
    "mcdonald", "subway", "pizza", "burger king", "kfc",
    "starbucks", "costa", "cafe", "restaurant", "dining", "nandos",
    "wagamama", "deliveroo", "uber eats", "just eat", "doordash",
    "grubhub", "chipotle", "five guys", "pret", "greggs",
    "dominos", "papa john", "sushi", "thai",
    "food delivery", "takeaway", "takeout", "kitchen",
  ],
  transportation: [
    "obilet", "biletix",
    "uber", "lyft", "taxi", "bolt", "free now",
    "bus", "train", "metro", "rail", "underground", "tube", "tfl",
    "national rail", "eurostar", "avanti",
    "fuel", "petrol", "shell", "bp", "esso", "texaco", "total",
    "parking", "park", "car park",
    "toll", "congestion", "garage",
    "ryanair", "easyjet", "british airways",
  ],
  bills: [
    "electric", "electricity", "gas", "water", "internet", "broadband",
    "phone", "mobile", "ee", "o2", "vodafone", "three", "bt", "sky",
    "utility", "energy", "council tax", "insurance",
    "virgin media", "talktalk", "plusnet",
    "british gas", "eon", "edf", "octopus", "bulb", "ovo energy",
    "thames water", "united utilities", "severn trent",
  ],
  subscriptions: [
    "netflix", "spotify", "disney", "apple",
    "youtube premium", "youtube", "hulu", "now tv",
    "deezer", "tidal", "apple music", "google play", "google one",
    "microsoft 365", "microsoft", "adobe", "dropbox", "icloud",
    "patreon", "twitch", "crunchyroll",
    "duolingo", "headspace", "calm", "strava",
    "linkedin premium", "github", "notion", "slack", "zoom",
  ],
  shopping: [
    "amazon", "trendyol", "hepsiburada", "n11",
    "ebay", "asos", "zara", "h&m", "primark",
    "next", "argos", "ikea", "john lewis", "currys",
    "boots", "superdrug", "the body shop", "sephora",
    "apple store", "apple.com", "samsung",
    "tk maxx", "home bargains", "b&m",
    "etsy", "zalando", "uniqlo",
  ],
  education: [
    "university", "college", "school", "coursera", "udemy", "skillshare",
    "tuition", "textbook", "kindle", "audible", "masterclass", "pluralsight",
    "linkedin learning", "edx", "futurelearn",
    "student loan", "exam",
  ],
  health: [
    "pharmacy", "nhs", "dentist", "dental", "hospital",
    "doctor", "gp", "optician", "specsavers",
    "gym", "fitness", "puregym", "david lloyd", "virgin active",
    "anytime fitness", "the gym",
    "holland & barrett", "vitamin", "supplement", "chemist",
    "physio", "physiotherapy",
  ],
  entertainment: [
    "cinema", "odeon", "vue", "cineworld",
    "theatre", "concert", "ticket", "ticketmaster", "eventbrite",
    "steam", "playstation", "xbox", "nintendo", "psn",
    "epic games", "humble bundle",
    "bowling", "escape room", "museum", "gallery",
    "zoo", "theme park",
  ],
  rent: [
    "kira", "rent", "landlord", "letting agent", "estate agent",
    "mortgage", "housing", "accommodation", "tenancy",
  ],
  income: [
    "maas", "maaş", "salary", "payroll", "wages", "employer",
    "tax refund", "bacs", "dividend", "interest", "cashback",
    "refund", "transfer in", "payment received", "income", "freelance",
  ],
};

export interface CustomRule {
  pattern: string;
  category: string;
}

export function categorize(
  merchant: string,
  description: string,
  customRules: CustomRule[] = []
): string {
  const haystack = `${merchant} ${description}`.toLowerCase();

  for (const rule of customRules) {
    if (haystack.includes(rule.pattern.toLowerCase())) {
      return rule.category;
    }
  }

  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some((kw) => haystack.includes(kw))) {
      return category;
    }
  }

  return "other";
}

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
];
