import { CATEGORIES, normalizeCategoryId } from "@workspace/finance-categories";

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

export function normalizeCategorizationText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/\u011f/g, "g")
    .replace(/\u015f/g, "s")
    .replace(/\u00e7/g, "c")
    .replace(/\u00f6/g, "o")
    .replace(/\u00fc/g, "u");
}

export function matchCustomRule(
  merchant: string,
  description: string,
  customRules: CustomRule[] = [],
): CustomRule | null {
  const haystack = normalizeCategorizationText(`${merchant} ${description}`);

  for (const rule of customRules) {
    if (haystack.includes(normalizeCategorizationText(rule.pattern))) {
      return { ...rule, category: normalizeCategoryId(rule.category) };
    }
  }

  return null;
}

export function categorizeBuiltIn(merchant: string, description: string): string {
  const haystack = normalizeCategorizationText(`${merchant} ${description}`);

  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some((kw) => haystack.includes(normalizeCategorizationText(kw)))) {
      return category;
    }
  }

  return "other";
}

export function categorize(
  merchant: string,
  description: string,
  customRules: CustomRule[] = []
): string {
  const customRule = matchCustomRule(merchant, description, customRules);
  return customRule?.category ?? categorizeBuiltIn(merchant, description);
}

export { CATEGORIES };
