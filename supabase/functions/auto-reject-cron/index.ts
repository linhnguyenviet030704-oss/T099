/**
 * Supabase Edge Function: auto-reject-cron
 *
 * Chạy mỗi giờ qua Supabase Cron.
 * Gọi RPC auto_reject_expired_applications để:
 * 1. Auto-reject applications pending quá deadline
 * 2. Trừ điểm recruiter
 * 3. Tạo notifications cho candidate + recruiter
 *
 * Auth: Header X-Cron-Secret phải khớp env CRON_SECRET.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedAuth = Deno.env.get("CRON_SECRET");
    if (!expectedAuth || cronSecret !== expectedAuth) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create Supabase client với service_role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Gọi RPC auto_reject_expired_applications
    const { data, error } = await supabase.rpc("auto_reject_expired_applications", {
      p_batch_size: 100,
    });

    if (error) {
      console.error("auto_reject_expired_applications error:", error);
      throw error;
    }

    const rejectedCount = Array.isArray(data) ? data.length : 0;
    console.log(`✅ Auto-rejected ${rejectedCount} expired applications`);

    return new Response(
      JSON.stringify({
        success: true,
        rejected_count: rejectedCount,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Error in auto-reject-cron:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
