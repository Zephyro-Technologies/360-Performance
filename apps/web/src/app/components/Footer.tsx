import type { ReactNode } from "react";
import { Link } from "react-router";
import { MessageCircle } from "lucide-react";
import { Logo } from "./Logo";
import { whatsappGeneralUrl, WHATSAPP_DISPLAY } from "@360/lib/whatsapp";
import { SOCIAL_LINKS } from "../data/content";

// lucide-react v1 removed brand/logo glyphs (they're trademarks), so the socials are inlined as
// simple-icons paths. `currentColor` lets each inherit the circular button's text colour on hover.
function Instagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0Zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227a3.81 3.81 0 0 1-.899 1.382 3.744 3.744 0 0 1-1.38.896c-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421a3.716 3.716 0 0 1-1.379-.899 3.644 3.644 0 0 1-.9-1.38c-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03Zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z" />
    </svg>
  );
}
function Facebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}
function Youtube({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
    </svg>
  );
}
// lucide-react has no TikTok glyph either, so it's inlined the same way.
function TikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.8c-1.3.1-2.6-.3-3.6-1v6.1a5.9 5.9 0 1 1-5.9-5.9c.3 0 .5 0 .8.1v2.9a3 3 0 1 0 2.1 2.9V3h3.1Z" />
    </svg>
  );
}

const SOCIALS = [
  { label: "Instagram", href: SOCIAL_LINKS.instagram, Icon: Instagram },
  { label: "Facebook", href: SOCIAL_LINKS.facebook, Icon: Facebook },
  { label: "TikTok", href: SOCIAL_LINKS.tiktok, Icon: TikTok },
  { label: "YouTube", href: SOCIAL_LINKS.youtube, Icon: Youtube },
];

const EXPLORE = [
  { label: "Shop All Parts", to: "/catalogue" },
  { label: "Our Story", to: "/#our-story" },
  { label: "News & Build Notes", to: "/blog" },
];

const POLICIES = [
  { label: "Return & Refund Policy", to: "/policies/returns" },
  { label: "Delivery Info", to: "/policies/shipping" },
  { label: "Privacy Policy", to: "/policies/privacy" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-black text-white">
      {/* Four columns, not two: the old layout was a policies list beside a contact block with a
          wide empty gulf between them. Brand + Explore + Policies + Get In Touch fills the row and
          gives the footer real navigational weight. */}
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:gap-8 lg:px-8 lg:py-16">
        {/* Brand */}
        <div>
          <Logo className="h-7" />
          <p className="mt-5 max-w-xs font-body text-sm leading-6 text-white/60">
            Genuine motorsports parts, hand-picked and shipped across Pakistan — order in one
            message on WhatsApp.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 transition-colors hover:border-brand hover:bg-brand"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        {/* Explore */}
        <FooterCol title="Explore">
          {EXPLORE.map((l) => (
            <FooterLink key={l.to} to={l.to}>
              {l.label}
            </FooterLink>
          ))}
        </FooterCol>

        {/* Policies */}
        <FooterCol title="Policies">
          {POLICIES.map((l) => (
            <FooterLink key={l.to} to={l.to}>
              {l.label}
            </FooterLink>
          ))}
        </FooterCol>

        {/* Get In Touch */}
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.3em] text-white/50">
            Get In Touch
          </p>
          <a
            href={whatsappGeneralUrl()}
            target="_blank"
            rel="noreferrer"
            aria-label="Talk to us on WhatsApp"
            className="mt-5 inline-flex items-center gap-2 font-body text-sm text-white transition-colors hover:text-brand"
          >
            <MessageCircle className="size-4 text-brand" /> {WHATSAPP_DISPLAY}
          </a>
          <p className="mt-2 font-body text-sm text-white/60">Islamabad, Pakistan</p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 sm:flex-row sm:px-6 lg:px-8">
          <p className="font-body text-xs text-white/40">
            © {year} 360 Performance. All rights reserved.
          </p>
          <p className="font-heading text-[10px] font-bold uppercase tracking-[0.3em] text-white/30">
            Est. 2018 · Islamabad
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-heading text-xs font-bold uppercase tracking-[0.3em] text-white/50">
        {title}
      </p>
      <ul className="mt-5 flex flex-col gap-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="font-body text-sm text-white/85 transition-colors hover:text-brand"
      >
        {children}
      </Link>
    </li>
  );
}
