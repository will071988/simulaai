import type { MetadataRoute } from "next";
import { supabaseService } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://simulaai-kappa.vercel.app").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/concursos`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${siteUrl}/simulados`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/quiz`, changeFrequency: "monthly", priority: 0.6 },\n    { url: `${siteUrl}/privacidade`, changeFrequency: "yearly", priority: 0.3 },\n    { url: `${siteUrl}/termos`, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const svc = supabaseService();
    const { data, error } = await svc
      .from("concursos")
      .select("id,updated_at")
      .eq("is_publishable", true)
      .order("updated_at", { ascending: false })
      .limit(5000);

    if (error) throw new Error("SITEMAP_QUERY_FAILED");

    return [
      ...staticRoutes,
      ...(data || []).map((contest) => ({
        url: `${siteUrl}/concursos/${contest.id}`,
        lastModified: contest.updated_at ? new Date(contest.updated_at) : undefined,
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
