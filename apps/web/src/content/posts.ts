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
      "How to plan wedding flowers in Sri Lanka — build a checklist, compare current quotes, choose suitable blooms, and confirm timing with your florist.",
    primaryKeyword: "wedding flowers Sri Lanka",
    secondaryKeywords: [
      "bridal bouquet Sri Lanka",
      "wedding flower prices Sri Lanka",
      "wedding flower decoration Colombo",
    ],
    excerpt:
      "A practical guide to planning wedding flowers in Sri Lanka — what to order, what to ask, and when to confirm each detail.",
    datePublished: "2026-02-18",
    readingMinutes: 8,
    tag: "Weddings",
    body: [
      {
        kind: "p",
        text: "Flowers appear throughout many Sri Lankan weddings — from the poruwa and the bride's bouquet to reception tables and the car. This guide helps you list what you need, request comparable quotes, and browse current [wedding flower listings](/c/wedding).",
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
        text: "Once you have counts, ask for an itemised quote so you can compare like with like. If your family plans to arrange some pieces, browse [loose flower listings](/c/loose-flowers) and confirm quantities, condition, collection or delivery, and preparation time with the seller.",
      },
      { kind: "h2", text: "Choose blooms that survive the heat" },
      {
        kind: "p",
        text: "Heat, travel time, and venue conditions can affect different flowers in different ways. Ask your florist which options suit the date and venue, and confirm availability rather than relying on a fixed seasonal assumption. Common choices include:",
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
      { kind: "h2", text: "Build a current budget" },
      {
        kind: "p",
        text: "Flower prices and service charges change with design, quantity, availability, transport, and setup. Collect current written quotes from more than one seller and ask each one to separate flowers, labour, delivery, setup, and collection. A listing price may cover only the flowers, not a finished event package.",
      },
      {
        kind: "quote",
        text: "Before comparing totals, check exactly what each quote includes.",
      },
      { kind: "h2", text: "Order timing" },
      {
        kind: "ol",
        items: [
          "6–8 weeks out: confirm your florist or grower and lock the design and colours",
          "2–3 weeks out: finalise stem counts once your guest numbers settle",
          "3–4 days out: confirm the seller's actual preparation and dispatch plan",
          "Day before: arrange sturdy pieces (garlands, backdrops); keep bouquets cool overnight",
        ],
      },
      { kind: "h2", text: "Compare current listings" },
      {
        kind: "p",
        text: "On FlowerMarket.lk you can browse seller listings by district and compare retail arrangements with [wholesale stems](/products?type=wholesale). Listing details are supplied by each seller, so confirm price, availability, delivery, and the final specification before paying. Browse the current [wedding range](/c/wedding) to start your shortlist.",
      },
    ],
  },
  {
    slug: "how-to-keep-cut-flowers-fresh",
    title: "How to Keep Cut Flowers Fresh Longer in Sri Lanka's Heat",
    description:
      "Practical ways to care for cut flowers in Sri Lanka's heat — clean water, trimming, flower food, and suitable placement.",
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
        text: "A cut bouquet can fade quickly in Sri Lanka's heat. Its variety and condition matter, but a few minutes of sensible care can also help. Whether you bought [retail flowers](/products?type=retail) for the home or a larger order for an event, these steps apply to many common cut flowers.",
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
        text: "Vase life varies by variety, condition, and handling. [Chrysanthemums](/c/chrysanthemums), [orchids](/c/orchids) and [gerberas](/c/gerberas) are often chosen for arrangements intended to last, but ask the seller when the flowers were cut and how they were stored before buying.",
      },
    ],
  },
  {
    slug: "buying-wholesale-flowers-sri-lanka",
    title: "Buying Wholesale Flowers in Sri Lanka: Online Listings and Manning Market",
    description:
      "A buyer's guide to comparing wholesale flower listings with a Manning Market visit, including price, quantities, availability, and collection or delivery.",
    primaryKeyword: "wholesale flowers Sri Lanka",
    secondaryKeywords: [
      "bulk flowers Colombo",
      "Manning Market flowers",
      "flower supplier Sri Lanka",
    ],
    excerpt:
      "A checklist for florists, event planners, and shops comparing online wholesale listings with a market visit.",
    datePublished: "2026-04-01",
    readingMinutes: 6,
    tag: "Wholesale",
    body: [
      {
        kind: "p",
        text: "Wholesale buyers can compare online listings, contact known suppliers, or visit Manning Market in person. The best option depends on current stock, quantity, timing, transport, and the seller's terms. Use this checklist while reviewing [wholesale flower listings](/products?type=wholesale).",
      },
      { kind: "h2", text: "Compare the full cost" },
      {
        kind: "p",
        text: "A listed unit price is only one part of the total. Confirm whether it is per stem, bunch, or box; check the minimum quantity; and add delivery, collection, packing, and any applicable taxes. Online prices are supplied by sellers and should be reconfirmed before you commit.",
      },
      { kind: "h2", text: "Ask about condition and timing" },
      {
        kind: "p",
        text: "The sales channel alone does not guarantee freshness. Ask when the flowers were cut, how they have been stored, when they will be dispatched, and what happens if the delivered condition differs from what was agreed. Inspect in person when the order or event risk justifies it.",
      },
      { kind: "h2", text: "Time and certainty" },
      {
        kind: "ul",
        items: [
          "Review listed prices and minimum order quantities before contacting a seller",
          "Filter listings by district and flower type",
          "Send the selected items and your requirements in one WhatsApp enquiry",
          "Confirm current stock and fulfilment details directly with the seller",
        ],
      },
      { kind: "h2", text: "When the market still makes sense" },
      {
        kind: "p",
        text: "An in-person market visit lets you inspect available flowers before purchase and may suit urgent or unusual requirements. Online enquiries can help with advance comparison. Many buyers may use both, depending on the order.",
      },
      {
        kind: "quote",
        text: "Compare price, condition, availability, and fulfilment before choosing a seller.",
      },
      { kind: "h2", text: "How to buy wholesale on FlowerMarket.lk" },
      {
        kind: "ol",
        items: [
          "Switch the browse filter to Wholesale to see per-stem pricing and minimum order quantities",
          "Filter by district to narrow the available listings",
          "Review the seller's listed price, quantity, and lead time",
          "Send an enquiry and confirm every detail with the seller before paying",
        ],
      },
      {
        kind: "p",
        text: "To start a shortlist, browse the current [wholesale flower listings](/products?type=wholesale) and ask sellers to confirm availability and total cost.",
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
        text: "Browse current [flowers for Poya and temple offerings](/c/poya-temple), filter by district, and ask the seller to confirm availability, condition, price, and collection or delivery before ordering.",
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
