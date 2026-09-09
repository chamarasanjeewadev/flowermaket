/**
 * Editorial content ("Guides") — typed, static, server-rendered for SEO.
 *
 * Posts are plain data so the whole set is type-checked and tree-shakeable; no
 * markdown runtime or `any`. Body blocks render to semantic HTML in
 * `components/blog/PostBody.tsx`.
 *
 * Inline links inside `p`/`li` text use the form `[label](/products?type=wholesale)`.
 * Paths starting with `/` are internal and are locale-prefixed at render time,
 * which keeps our internal-linking crawlable and locale-correct.
 *
 * Content is English-first (the bulk of commercial flower search in Sri Lanka
 * is English); the Sinhala routes fall back to this per the site convention.
 */

export type PostBlock =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string };

export interface Post {
  slug: string;
  title: string;
  /** ~150–160 char meta description. */
  description: string;
  /** Primary target keyword (documented in docs/seo-strategy.md). */
  primaryKeyword: string;
  secondaryKeywords: string[];
  /** Short listing-card summary. */
  excerpt: string;
  /** ISO date (YYYY-MM-DD). */
  datePublished: string;
  dateModified?: string;
  readingMinutes: number;
  tag: string;
  body: PostBlock[];
}

export const POSTS: readonly Post[] = [
  {
    slug: "wedding-flowers-sri-lanka-guide",
    title: "Wedding Flowers in Sri Lanka: The Complete Planning Guide",
    description:
      "How to plan wedding flowers in Sri Lanka — what to order, realistic budgets in LKR, seasonal blooms, and how to buy bridal bouquets and centrepieces grower-direct.",
    primaryKeyword: "wedding flowers Sri Lanka",
    secondaryKeywords: [
      "bridal bouquet Sri Lanka",
      "wedding flower prices Sri Lanka",
      "wedding flower decoration Colombo",
    ],
    excerpt:
      "A practical, budget-aware guide to planning your wedding flowers in Sri Lanka — what to order, when, and how to buy direct from growers.",
    datePublished: "2026-02-18",
    readingMinutes: 8,
    tag: "Weddings",
    body: [
      {
        kind: "p",
        text: "Flowers set the mood of a Sri Lankan wedding — from the poruwa and the bride's bouquet to the reception tables and the car. But flowers are also one of the easiest line items to overspend on when you buy through a chain of middlemen. This guide walks through what you actually need, roughly what it costs in rupees, and how to buy [wedding flowers](/c/wedding) direct from local growers and florists.",
      },
      { kind: "h2", text: "Start with a flower checklist" },
      {
        kind: "p",
        text: "Before you talk to anyone, list every place flowers appear on the day. Most Sri Lankan weddings need some combination of the following:",
      },
      {
        kind: "ul",
        items: [
          "Bridal bouquet and a smaller bouquet for the going-away outfit",
          "Bridesmaids' bouquets and groomsmen buttonholes",
          "Poruwa decoration and the oil-lamp area",
          "Reception stage / backdrop and the cake table",
          "Table centrepieces (count your guest tables)",
          "Garlands for the couple and for welcoming elders",
          "Car flowers and entrance arrangements",
        ],
      },
      {
        kind: "p",
        text: "Once you have counts, you can price it properly instead of accepting one bundled quote. Ordering [loose flowers](/c/loose-flowers) by the bunch for the pieces your family arranges themselves — garlands, lamp areas, car — is often where the biggest savings hide.",
      },
      { kind: "h2", text: "Choose blooms that survive the heat" },
      {
        kind: "p",
        text: "Sri Lanka's warmth is tough on delicate imported flowers. Locally grown blooms not only cost less, they last longer because they haven't spent days in transit. Reliable choices include:",
      },
      {
        kind: "ul",
        items: [
          "Roses — highland-grown red, pink and white stems hold up well; see [roses](/c/roses)",
          "Gerbera daisies — bright, long-lasting and inexpensive per stem: [gerberas](/c/gerberas)",
          "Orchids — Dendrobium and Sonia sprays last for days and read as luxe: [orchids](/c/orchids)",
          "Chrysanthemums — the workhorse for volume, garlands and backdrops: [chrysanthemums](/c/chrysanthemums)",
          "Anthuriums and tropical foliage — dramatic and heat-hardy",
        ],
      },
      { kind: "h2", text: "A realistic budget in rupees" },
      {
        kind: "p",
        text: "Wedding flower budgets in Sri Lanka vary enormously with scale and style, but as a rough planning frame: a bridal bouquet from fresh premium stems typically lands in the tens of thousands of rupees when made by a florist; simple gerbera or chrysanthemum centrepieces cost a fraction of a rose-and-orchid design. The single biggest lever is buying stems direct and arranging the simpler pieces yourself or with your florist's guidance.",
      },
      {
        kind: "quote",
        text: "Rule of thumb: the further your flowers travel and the more hands they pass through, the more you pay for the same stem.",
      },
      { kind: "h2", text: "Order timing" },
      {
        kind: "ol",
        items: [
          "6–8 weeks out: confirm your florist or grower and lock the design and colours",
          "2–3 weeks out: finalise stem counts once your guest numbers settle",
          "3–4 days out: fresh stems are cut and dispatched for a weekend wedding",
          "Day before: arrange sturdy pieces (garlands, backdrops); keep bouquets cool overnight",
        ],
      },
      { kind: "h2", text: "Buy direct and keep the savings" },
      {
        kind: "p",
        text: "On FlowerMarket.lk you can compare verified growers and florists by district, order retail arrangements or [wholesale stems](/products?type=wholesale) in bulk, and skip the pre-dawn Manning Market run entirely. Browse the full [wedding range](/c/wedding) to start pricing your day.",
      },
    ],
  },
  {
    slug: "how-to-keep-cut-flowers-fresh",
    title: "How to Keep Cut Flowers Fresh Longer in Sri Lanka's Heat",
    description:
      "Simple, proven ways to make cut flowers last longer in Sri Lanka's heat — water, trimming, flower food, and placement tips that add days to any bouquet.",
    primaryKeyword: "how to keep flowers fresh",
    secondaryKeywords: [
      "make cut flowers last longer",
      "flower care tips",
      "flower care Sri Lanka",
    ],
    excerpt:
      "Ten minutes of care can add days to any bouquet. Here's how to keep cut flowers fresh in Sri Lanka's warm, humid climate.",
    datePublished: "2026-03-05",
    readingMinutes: 5,
    tag: "Flower care",
    body: [
      {
        kind: "p",
        text: "A fresh bouquet can look tired within two days in Sri Lanka's heat — or stay beautiful for a week. The difference is a few minutes of care. Whether you bought [retail flowers](/products?type=retail) for the home or a big order for an event, these steps apply to almost every stem.",
      },
      { kind: "h2", text: "1. Trim the stems on an angle" },
      {
        kind: "p",
        text: "As soon as flowers arrive, cut 2–3 cm off each stem at a 45° angle with a clean, sharp knife or scissors. The angle stops stems sitting flat on the vase base and re-opens the channels that draw up water. Re-trim every two to three days.",
      },
      { kind: "h2", text: "2. Use clean, cool water — and change it" },
      {
        kind: "p",
        text: "Bacteria in cloudy water is the number-one reason flowers wilt early. Start with a spotless vase, fill with cool water, and change it completely every one to two days in warm weather. Rinse the stems each time.",
      },
      { kind: "h2", text: "3. Strip leaves below the waterline" },
      {
        kind: "p",
        text: "Any leaf sitting underwater rots and feeds bacteria. Remove all foliage that would sit below the waterline before you arrange.",
      },
      { kind: "h2", text: "4. Feed them" },
      {
        kind: "p",
        text: "Flower food balances sugar (energy) with an acidifier and a mild antibacterial. If you don't have a sachet, a common home mix is:",
      },
      {
        kind: "ul",
        items: [
          "1 litre clean water",
          "1 teaspoon sugar",
          "1 teaspoon white vinegar or a squeeze of lime",
          "A few drops of household bleach to keep water clear",
        ],
      },
      { kind: "h2", text: "5. Keep them cool and out of the sun" },
      {
        kind: "p",
        text: "Heat is the enemy. Keep arrangements away from direct sunlight, hot windows, the top of the fridge, and fruit bowls — ripening fruit releases ethylene gas that ages flowers fast. A cooler room, or the coolest corner of the house, buys extra days.",
      },
      { kind: "h2", text: "Flowers that naturally last longer" },
      {
        kind: "p",
        text: "If you want maximum vase life, start with hardy blooms. [Chrysanthemums](/c/chrysanthemums), [orchids](/c/orchids) and [gerberas](/c/gerberas) are among the longest-lasting flowers grown locally — and buying them [grower-direct](/products) means they reach you fresher to begin with.",
      },
    ],
  },
  {
    slug: "buying-wholesale-flowers-sri-lanka",
    title: "Buying Wholesale Flowers in Sri Lanka: Grower-Direct vs Manning Market",
    description:
      "A buyer's guide to wholesale flowers in Sri Lanka — how grower-direct ordering compares with the Manning Market run on price, freshness and hassle.",
    primaryKeyword: "wholesale flowers Sri Lanka",
    secondaryKeywords: [
      "bulk flowers Colombo",
      "Manning Market flowers",
      "flower supplier Sri Lanka",
    ],
    excerpt:
      "Florists, event planners and shops: here's how grower-direct wholesale compares with the 4am Manning Market run on price, freshness and time.",
    datePublished: "2026-04-01",
    readingMinutes: 6,
    tag: "Wholesale",
    body: [
      {
        kind: "p",
        text: "For years, buying flowers in bulk in Sri Lanka meant one thing: a pre-dawn trip to Manning Market in Colombo, cash in hand, hoping the stems you need are in and fresh. It works — but it costs you time, and every hand between the field and your bucket adds to the price. Here's how ordering [wholesale flowers](/products?type=wholesale) direct from growers compares.",
      },
      { kind: "h2", text: "Price: fewer middlemen, lower cost" },
      {
        kind: "p",
        text: "The traditional chain runs grower → collector → market trader → you. Each link adds a margin. Buying grower-direct removes most of that chain, so the same rose or gerbera stem reaches you at a lower price — and you see the grower's price up front instead of haggling at 4am.",
      },
      { kind: "h2", text: "Freshness: cut-to-order beats sat-in-market" },
      {
        kind: "p",
        text: "Market stems may have been cut days earlier and passed through several stops. Grower-direct orders are often cut closer to dispatch, so they arrive fresher and last longer in your shop or at your event — which means less wastage and fewer unhappy customers.",
      },
      { kind: "h2", text: "Time and certainty" },
      {
        kind: "ul",
        items: [
          "No 4am travel and no parking or transport hassle",
          "See stock, prices and minimum order quantities before you commit",
          "Filter by district to buy from growers near you and cut delivery time",
          "A paper trail — useful for event planners billing clients",
        ],
      },
      { kind: "h2", text: "When the market still makes sense" },
      {
        kind: "p",
        text: "Manning Market still wins for last-minute, walk-in buying and for unusual one-off stems. The honest answer for most florists and planners is a mix: plan your predictable volume grower-direct, and keep the market for emergencies.",
      },
      {
        kind: "quote",
        text: "Plan your volume grower-direct; keep the market for emergencies.",
      },
      { kind: "h2", text: "How to buy wholesale on FlowerMarket.lk" },
      {
        kind: "ol",
        items: [
          "Switch the browse filter to Wholesale to see per-stem pricing and minimum order quantities",
          "Filter by district to find growers near you",
          "Compare verified growers by price and lead time",
          "Order the volume you need — popular lines include [roses](/c/roses), [gerberas](/c/gerberas) and [chrysanthemums](/c/chrysanthemums)",
        ],
      },
      {
        kind: "p",
        text: "Ready to price a bulk order? Browse [wholesale flowers by the stem](/products?type=wholesale) and compare growers across the island.",
      },
    ],
  },
  {
    slug: "flowers-for-poya-and-temple-offerings",
    title: "Flowers for Poya Days & Temple Offerings: A Simple Guide",
    description:
      "Which flowers to offer at the temple on Poya days, what each traditionally means, and how to buy fresh lotus, jasmine and araliya for offerings in Sri Lanka.",
    primaryKeyword: "poya flowers",
    secondaryKeywords: [
      "temple flowers Sri Lanka",
      "flowers for offering",
      "lotus flowers Sri Lanka",
    ],
    excerpt:
      "A short guide to choosing and caring for flowers offered at the temple on Poya days — lotus, jasmine, araliya and more.",
    datePublished: "2026-05-12",
    readingMinutes: 4,
    tag: "Traditions",
    body: [
      {
        kind: "p",
        text: "Offering flowers (mal pooja) is one of the most familiar acts of devotion at a Sri Lankan temple, especially on Poya days. Fresh blooms laid at the shrine are a quiet reminder of impermanence — they bloom, they fade. This short guide covers the flowers most commonly offered and how to keep them fresh for the visit.",
      },
      { kind: "h2", text: "Flowers traditionally offered" },
      {
        kind: "ul",
        items: [
          "Lotus (nelum) — the classic offering, associated with purity",
          "Jasmine (pichcha / saman pichcha) — fragrant and often strung",
          "Araliya (temple flower / frangipani) — a temple staple",
          "Ixora (rathmal) and other bright local blooms",
          "Water lily (olu / manel) — offered where lotus isn't available",
        ],
      },
      {
        kind: "p",
        text: "For most offerings you'll want [loose flowers](/c/loose-flowers) by the bunch rather than an arrangement, and many families also carry a [garland](/c/garlands) for the Bodhi tree or shrine.",
      },
      { kind: "h2", text: "Keep them fresh until you reach the temple" },
      {
        kind: "ol",
        items: [
          "Buy as close to the day as you can — Poya-day mornings are busiest",
          "Keep flowers cool and shaded on the way; heat wilts them fast",
          "Wrap stems in a damp cloth or keep lotus buds in a little water",
          "Handle blooms gently — bruised petals brown quickly",
        ],
      },
      { kind: "h2", text: "Buy fresh for Poya" },
      {
        kind: "p",
        text: "You can order fresh [flowers for Poya and temple offerings](/c/poya-temple) direct from local growers on FlowerMarket.lk — often fresher and better value than a last-minute roadside stop. Browse by district to find blooms near you.",
      },
    ],
  },
];

/** Newest first, for the guides index. */
export function listPosts(): readonly Post[] {
  return [...POSTS].sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );
}

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
