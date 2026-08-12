export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);

    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");

    if (response.ok) {
      const isDocument = url.pathname.endsWith("/") || url.pathname.endsWith(".html");
      const isDiscoveryFile = ["/rss.xml", "/sitemap.xml", "/robots.txt"].includes(url.pathname);
      headers.set(
        "Cache-Control",
        isDocument || isDiscoveryFile
          ? "public, max-age=300, must-revalidate"
          : "public, max-age=31536000, immutable",
      );
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
