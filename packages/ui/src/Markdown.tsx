// Sanitized Markdown renderer (D6). Raw HTML is DISABLED (no rehype-raw, so
// react-markdown renders React elements — no dangerouslySetInnerHTML anywhere) and
// link/image URL schemes are restricted to http(s)/mailto/tel/relative/anchor
// (javascript:/data: stripped). Markdown is NOT auto-safe; this guard is required.
// Shared by the dashboard editor preview and the public blog render.
import ReactMarkdown from "react-markdown";

const safeUrl = (url: string) => (/^(https?:|mailto:|tel:|\/|#)/i.test(url) ? url : "");

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed [&_a]:text-[#cc0000] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_img]:my-2 [&_img]:rounded-md [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        urlTransform={safeUrl}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
