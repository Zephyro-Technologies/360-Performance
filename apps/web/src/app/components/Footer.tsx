import { Link } from "react-router";
import { Instagram, Facebook, MessageCircle } from "lucide-react";
import { Logo } from "./Logo";
import { whatsappGeneralUrl, WHATSAPP_DISPLAY } from "@360/lib/whatsapp";

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
          <p className="mt-1 font-body text-sm text-white/60">
            Islamabad, Pakistan — showroom coming soon
          </p>
          <div className="mt-5 flex gap-2">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="rounded-full border border-white/20 p-2 transition-colors hover:border-brand hover:bg-brand"
            >
              <Instagram className="size-4" />
            </a>
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
              className="rounded-full border border-white/20 p-2 transition-colors hover:border-brand hover:bg-brand"
            >
              <Facebook className="size-4" />
            </a>
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
