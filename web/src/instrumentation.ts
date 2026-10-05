import type { Instrumentation } from "next";
import { supabaseService } from "@/lib/supabase-server";

export const onRequestError: Instrumentation.onRequestError = async (_error, _request, context) => {
  const route = context.routePath.slice(0, 160) || "unknown";
  console.error(JSON.stringify({
    event: "request_error",
    routeType: context.routeType,
    route,
    code: "UNHANDLED_REQUEST_ERROR",
  }));
  try {
    const { error } = await supabaseService().from("ops_runtime_events").insert({ event_kind: "REQUEST_ERROR", component: route, error_code: "UNHANDLED_REQUEST_ERROR" });
    if (error) console.error(JSON.stringify({ event: "observability_write_failed", component: "request_error", code: "INSERT_FAILED" }));
  } catch { console.error(JSON.stringify({ event: "observability_write_failed", component: "request_error", code: "UNAVAILABLE" })); }
};
