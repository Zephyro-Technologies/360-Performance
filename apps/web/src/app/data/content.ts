// ---------------------------------------------------------------------------
// 360 Performance — Website editorial TYPES + static marketing copy.
// Dynamic content (announcement, testimonials, blog) is admin-managed and fetched
// from Supabase (anon, published-only) via api.ts. HERO / OUR_STORY are static
// brand copy that lives with the site.
// ---------------------------------------------------------------------------

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  rating: number;
  quote: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  image: string;
  author?: string;
  readMinutes?: number;
  bodyMd?: string; // Markdown — rendered sanitized via @360/ui/Markdown
}

// Real social profiles. Also mirrored into the Organization JSON-LD `sameAs` in index.html
// (which can't import from here).
export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/beamerr_360/?hl=en",
  facebook: "https://www.facebook.com/profile.php?id=61556915004933",
  tiktok: "https://www.tiktok.com/@beamerr__360",
  youtube: "https://www.youtube.com/@Beamerr_360",
} as const;

// Accepted payment methods, surfaced in the trust strip + shipping policy so a buyer doesn't have
// to ask before messaging.
export const PAYMENT_METHODS = ["Easypaisa", "JazzCash", "Bank Transfer"] as const;

export const HERO = {
  eyebrow: "Pakistan's Trusted Motorsports Parts Store",
  title: "BUILT TO PERFORM.",
  subtitle:
    "Exhausts, turbos, cooling and more — genuine performance parts, shipped nationwide. No fluff. Just power.",
  cta: "SHOP NOW",
};

export const OUR_STORY = {
  title: "OUR STORY",
  body: [
    "360 Performance started in a single Islamabad garage with one obsession: helping Pakistan's car enthusiasts build machines that actually perform.",
    "Today we stock a full catalogue of hand-picked motorsports parts — from bolt-on exhausts to billet turbos — and ship them to driveways and workshops across the country. Every part we list is one we'd run on our own builds.",
    "We're not a marketplace and we're not casual shoppers. We're enthusiasts who answer the phone, know the fitment, and stand behind the gear. A physical showroom is on the way.",
  ],
};
