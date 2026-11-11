import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /r/* receive links are not blocked here on purpose: they carry a
      // noindex tag (app/r/[id]/layout.tsx), which crawlers can only see if
      // they're allowed to fetch the page.
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
