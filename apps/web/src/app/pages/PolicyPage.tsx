import type { ReactNode } from "react";
import { whatsappGeneralUrl } from "@360/lib/whatsapp";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { PageHeader } from "../components/PageHeader";
import { useDocumentMeta } from "../lib/head";

export interface PolicySection {
  heading: string;
  body: ReactNode;
}

export function PolicyPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro: string;
  updated: string;
  sections: PolicySection[];
}) {
  // Without this these pages inherited whatever title/description/canonical the previous route left.
  useDocumentMeta(title, intro);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[{ label: "Home", to: "/" }, { label: title }]}
      />

      <div className="mt-6">
        <PageHeader eyebrow={`Last updated ${updated}`} title={title} tagline={intro} />
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {sections.map((s) => (
          <section key={s.heading}>
            {/* h2, not h3: sits under the page h1 with no h2 between, so h3 skipped a level. */}
            <h2 className="mb-2 text-xl">{s.heading}</h2>
            <div className="font-body text-sm leading-relaxed text-foreground/80">
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Every policy routes to the one channel that actually exists. */
function WhatsAppLink({ children }: { children: ReactNode }) {
  return (
    <a
      href={whatsappGeneralUrl()}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover"
    >
      {children}
    </a>
  );
}

export function ReturnsPolicy() {
  return (
    <PolicyPage
      title="Return & Refund Policy"
      updated="July 2026"
      intro="We want you running the right parts. If something isn't right, here's how returns and refunds work at 360 Performance."
      sections={[
        {
          heading: "Return Window",
          body: "Unused parts in their original, undamaged packaging may be returned within 7 days of delivery. Items must be in resalable condition with all hardware and documentation included.",
        },
        {
          heading: "Non-Returnable Items",
          body: "Electrical components, fluids, and made-to-order or custom items cannot be returned once dispatched, unless they arrive faulty or incorrect.",
        },
        {
          heading: "Faulty or Incorrect Items",
          body: (
            <>
              If a part arrives faulty, damaged, or simply isn't what you ordered, message us on{" "}
              <WhatsAppLink>WhatsApp</WhatsAppLink> within 48 hours with photos. We'll put it right — a
              replacement, or your money back — at no cost to you.
            </>
          ),
        },
        {
          heading: "Refunds",
          body: "Once we've received the part back and checked it over, we refund you the same way you paid. Return shipping is on us when the fault is ours; otherwise it's on you.",
        },
        {
          heading: "How To Start A Return",
          body: (
            <>
              Message us on <WhatsAppLink>WhatsApp</WhatsAppLink> — the same chat you ordered in. Send the
              part name or SKU and tell us what's wrong, and we'll confirm whether it's covered and how to
              send it back. There's no form to fill in.
            </>
          ),
        },
      ]}
    />
  );
}

export function ShippingPolicy() {
  return (
    <PolicyPage
      title="Shipping Policy"
      updated="June 2026"
      intro="360 Performance is an order-based store shipping nationwide across Pakistan. Here's what to expect after you place an order."
      sections={[
        {
          heading: "How Ordering Works",
          body: (
            <>
              There's no checkout here. You pick a part, tap{" "}
              <WhatsAppLink>Order on WhatsApp</WhatsAppLink>, and it opens a chat with the part, its SKU and
              its price already filled in. A real person then confirms fitment, stock, shipping cost and
              delivery details with you before anything is dispatched.
            </>
          ),
        },
        {
          heading: "Areas Served",
          body: "We ship to all major cities and towns across Pakistan, including Islamabad, Lahore, Karachi, Rawalpindi, Peshawar, Faisalabad, Multan, and beyond.",
        },
        {
          heading: "Delivery Timeframes",
          body: "In-stock items typically dispatch within 1–3 business days of confirmation. Made-to-order parts have longer lead times, which we'll tell you before you commit to anything.",
        },
        {
          heading: "Shipping Costs",
          body: (
            <>
              Shipping is quoted per order based on weight, destination and courier. We'll confirm the exact
              charge in the <WhatsAppLink>WhatsApp</WhatsAppLink> chat before anything is dispatched — you'll
              never be surprised by a cost after the fact.
            </>
          ),
        },
        {
          heading: "Tracking",
          body: (
            <>
              Once your order ships we send the tracking details straight to the same{" "}
              <WhatsAppLink>WhatsApp</WhatsAppLink> chat, so everything about your order lives in one thread.
            </>
          ),
        },
      ]}
    />
  );
}

export function PrivacyPolicy() {
  return (
    <PolicyPage
      title="Privacy Policy"
      updated="June 2026"
      intro="Your trust matters. This policy explains what data 360 Performance collects, how we use it, and the rights you have over it."
      sections={[
        {
          heading: "This Website Collects Nothing",
          body: "Browsing this site creates no account and no cart. We don't run ads, trackers, or analytics profiling on you, and nothing you look at here is stored against your name.",
        },
        {
          heading: "What We Collect When You Order",
          body: (
            <>
              An order starts when you message us on <WhatsAppLink>WhatsApp</WhatsAppLink>, so we get whatever
              you send us there — typically your name, your number, your vehicle, and a delivery address. We
              keep that to fulfil the order and support you afterwards. We take no card details on this site.
            </>
          ),
        },
        {
          heading: "How We Use It",
          body: "To confirm fitment, quote shipping, dispatch your parts, and help you if something goes wrong. That's all. We don't sell your data, and we won't message you with marketing you didn't ask for.",
        },
        {
          heading: "Who Else Sees It",
          body: "Only the courier, and only the delivery details they need to get the part to your door. Your order record is stored in our own system and is visible only to 360 Performance staff.",
        },
        {
          heading: "Your Rights",
          body: (
            <>
              Ask us on <WhatsAppLink>WhatsApp</WhatsAppLink> to see, correct, or delete what we hold about
              you, and we will. Same chat, same people.
            </>
          ),
        },
      ]}
    />
  );
}
