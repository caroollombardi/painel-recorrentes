import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ClientAlert {
  clientName: string;
  percentConsumed: number;
  percentElapsed: number;
  hoursConsumed: number;
  valueConsumed: number;
  alertLevel: 'attention' | 'risk' | 'overflow';
}

interface NotificationRequest {
  alerts: ClientAlert[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: NotificationRequest = await req.json();
    const { alerts } = body;

    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ message: "No alerts to process" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${alerts.length} alerts`);

    // Get notification settings
    const { data: settings } = await supabase
      .from("alert_settings")
      .select("*")
      .limit(1)
      .single();

    if (!settings) {
      console.log("No settings found");
      return new Response(JSON.stringify({ message: "No settings configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active recipients
    const { data: recipients } = await supabase
      .from("notification_recipients")
      .select("*")
      .eq("is_active", true);

    if (!recipients || recipients.length === 0) {
      console.log("No active recipients");
      return new Response(JSON.stringify({ message: "No recipients configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { sent: number; failed: number; messages: string[] } = {
      sent: 0,
      failed: 0,
      messages: [],
    };

    // Process each alert
    for (const alert of alerts) {
      const message = generateAlertMessage(alert);
      
      // Get recipients for this alert level
      const levelRecipients = recipients.filter((r: any) =>
        r.alert_levels.includes(alert.alertLevel)
      );

      for (const recipient of levelRecipients) {
        try {
          let success = false;
          let errorMessage = "";

          if (recipient.type === "email" && settings.email_notifications_enabled) {
            // Try to send email (requires RESEND_API_KEY)
            const resendKey = Deno.env.get("RESEND_API_KEY");
            if (resendKey) {
              const emailResult = await sendEmail(resendKey, recipient.value, alert, message);
              success = emailResult.success;
              errorMessage = emailResult.error || "";
            } else {
              errorMessage = "RESEND_API_KEY not configured";
              console.log("Email skipped: RESEND_API_KEY not set");
            }
          } else if (recipient.type === "whatsapp" && settings.whatsapp_notifications_enabled) {
            // WhatsApp requires additional configuration
            const whatsappKey = Deno.env.get("WHATSAPP_API_KEY");
            if (whatsappKey) {
              const whatsappResult = await sendWhatsApp(whatsappKey, recipient.value, message);
              success = whatsappResult.success;
              errorMessage = whatsappResult.error || "";
            } else {
              errorMessage = "WHATSAPP_API_KEY not configured";
              console.log("WhatsApp skipped: WHATSAPP_API_KEY not set");
            }
          }

          // Log to history
          await supabase.from("notification_history").insert({
            client_name: alert.clientName,
            alert_level: alert.alertLevel,
            notification_type: recipient.type,
            recipient: recipient.value,
            message: message,
            percent_consumed: alert.percentConsumed,
            percent_month_elapsed: alert.percentElapsed,
            hours_consumed: alert.hoursConsumed,
            value_consumed: alert.valueConsumed,
            success,
            error_message: errorMessage || null,
          });

          if (success) {
            results.sent++;
            results.messages.push(`✓ ${recipient.type} para ${recipient.value}`);
          } else {
            results.failed++;
            results.messages.push(`✗ ${recipient.type} para ${recipient.value}: ${errorMessage}`);
          }
        } catch (e) {
          console.error(`Error sending to ${recipient.value}:`, e);
          results.failed++;
        }
      }
    }

    console.log(`Notifications sent: ${results.sent}, failed: ${results.failed}`);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in send-alert-notifications:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateAlertMessage(alert: ClientAlert): string {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const emoji = alert.alertLevel === "overflow" ? "🚨" : alert.alertLevel === "risk" ? "⚠️" : "🔔";
  const title = alert.alertLevel === "overflow" 
    ? "Estouro de Pacote" 
    : alert.alertLevel === "risk" 
      ? "Risco de Estouro" 
      : "Atenção Interna";

  const currentDay = new Date().getDate();

  return `${emoji} ${title}

Cliente: ${alert.clientName}
Consumo: ${alert.percentConsumed.toFixed(1)}% do pacote mensal
Horas: ${alert.hoursConsumed.toFixed(1)}h
Valor: ${formatCurrency(alert.valueConsumed)}
Dia do mês: ${currentDay} (${alert.percentElapsed.toFixed(0)}% decorrido)

${alert.alertLevel === "overflow" 
  ? "Faturamento adicional necessário." 
  : alert.alertLevel === "risk"
    ? "Avaliar cobrança adicional ou ajuste de escopo."
    : "Monitorar consumo nas próximas semanas."}`;
}

async function sendEmail(
  apiKey: string,
  to: string,
  alert: ClientAlert,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subject = alert.alertLevel === "overflow"
      ? `🚨 Estouro de Pacote: ${alert.clientName}`
      : alert.alertLevel === "risk"
        ? `⚠️ Risco de Estouro: ${alert.clientName}`
        : `🔔 Atenção: ${alert.clientName}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "WSA Alertas <alertas@wsa.adv.br>",
        to: [to],
        subject,
        text: message,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return { success: true };
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: errorMessage };
  }
}

async function sendWhatsApp(
  apiKey: string,
  to: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  // Placeholder for WhatsApp integration
  // Can be implemented with Twilio, Z-API, or other providers
  console.log(`WhatsApp to ${to}: ${message}`);
  return { success: false, error: "WhatsApp integration not configured" };
}