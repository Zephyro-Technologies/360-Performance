import type { ReactNode } from "react";
import { Link } from "react-router";
import { Instagram, Facebook, Youtube, MessageCircle } from "lucide-react";
import { Logo } from "./Logo";
import { whatsappGeneralUrl, WHATSAPP_DISPLAY } from "@360/lib/whatsapp";
import { SOCIAL_LINKS, PAYMENT_METHODS } from "../data/content";

// lucide-react has no TikTok glyph, so it's inlined.
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
          <p className="mt-6 font-heading text-[11px] font-bold uppercase tracking-[0.25em] text-white/40">
            We Accept
          </p>
          <p className="mt-2 font-body text-sm text-white/70">{PAYMENT_METHODS.join(" · ")}</p>
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
