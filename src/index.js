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
    if (env.FRONTIER_RELEASE_ATTEMPT) {
      headers.set("X-Frontier-Release-Attempt", env.FRONTIER_RELEASE_ATTEMPT);
    }

    if (response.ok) {
      const isDocument = url.pathname.endsWith("/") || url.pathname.endsWith(".html");
      const isDiscoveryFile = ["/rss.xml", "/sitemap.xml", "/robots.txt"].includes(url.pathname);
      const isVersionedSiteAsset = url.pathname.startsWith("/assets/");
      headers.set(
        "Cache-Control",
        isDocument || isDiscoveryFile
          ? "public, max-age=300, must-revalidate"
          : isVersionedSiteAsset
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600, must-revalidate",
      );
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
