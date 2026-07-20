// Renders a schema.org JSON-LD data block. type="application/ld+json" is a
// non-executable data block (CSP script-src does not govern it). We still escape
// "<" so a value containing "</script>" can't break out of the element.
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
