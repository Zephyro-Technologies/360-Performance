import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "@360/ui/Markdown";

// D6: Markdown renders with raw HTML disabled (escaped to text, never live
// elements) and dangerous URL schemes stripped from real link/image nodes. These
// assertions check for LIVE dangerous vectors — not literal strings in escaped text.
describe("Markdown sanitization (D6)", () => {
  it("never renders raw HTML as live elements", () => {
    const payload = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(2)>",
      "<iframe src='javascript:alert(3)'></iframe>",
      "<a href=\"javascript:alert(4)\">x</a>",
    ].join("\n\n");
    const { container } = render(<Markdown>{payload}</Markdown>);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    // the raw <a> is escaped to text, so no anchor carries the javascript: href
    for (const a of container.querySelectorAll("a")) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    }
  });

  it("strips javascript:/data: from markdown links and images", () => {
    const payload = [
      "[a](javascript:alert(1))",
      "![b](javascript:alert(2))",
      "![c](data:text/html;base64,PHNjcmlwdD4=)",
      "[ok](https://example.com)",
    ].join("\n\n");
    const { container } = render(<Markdown>{payload}</Markdown>);
    for (const a of container.querySelectorAll("a")) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    }
    for (const img of container.querySelectorAll("img")) {
      expect(img.getAttribute("src") ?? "").not.toMatch(/^(javascript:|data:)/i);
    }
    // the safe http link survives
    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("https://example.com");
  });

  it("renders safe markdown (emphasis + http link with rel)", () => {
    const { container } = render(<Markdown>{"**bold** and [site](https://example.com)"}</Markdown>);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("rel") ?? "").toMatch(/noopener/);
  });
});
