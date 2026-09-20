import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isConfigured } from "@/lib/higgsfield";
export async function GET() {
  return Response.json(
    {
      ready: isConfigured(),
      authenticated: !!(await getChatGPTUser()),
      model: "Seedance 2.5",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
