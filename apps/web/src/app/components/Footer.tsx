import { Link } from "react-router";
import { Instagram, Facebook, Youtube, MessageCircle } from "lucide-react";
import { Logo } from "./Logo";
import { whatsappGeneralUrl, WHATSAPP_DISPLAY } from "@360/lib/whatsapp";
import { SOCIAL_LINKS } from "../data/content";

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

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-black text-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-2 lg:px-8 lg:py-16">
        {/* Policies */}
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.3em] text-white/50">
            Policies
          </p>
          <ul className="mt-5 flex flex-col gap-2.5">
            <li>
              <Link
                to="/policies/returns"
                className="font-body text-sm text-white/85 transition-colors hover:text-brand"
              >
                Return &amp; Refund Policy
              </Link>
            </li>
            <li>
              <Link
                to="/policies/shipping"
                className="font-body text-sm text-white/85 transition-colors hover:text-brand"
              >
                Delivery Info
              </Link>
            </li>
            <li>
              <Link
                to="/policies/privacy"
                className="font-body text-sm text-white/85 transition-colors hover:text-brand"
              >
                Privacy Policy
              </Link>
            </li>
          </ul>
        </div>

        {/* Contact / Social */}
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
            <MessageCircle className="size-4 text-brand" /> Talk to us · {WHATSAPP_DISPLAY}
          </a>
          <p className="mt-1 font-body text-sm text-white/60">Islamabad, Pakistan</p>
          <div className="mt-5 flex flex-wrap gap-2">
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
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 sm:flex-row sm:px-6 lg:px-8">
          <Logo className="h-6" />
          <p className="font-body text-xs text-white/40">
            © {year} 360 Performance. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
