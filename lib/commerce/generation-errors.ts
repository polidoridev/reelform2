// Only expose known, actionable categories, never arbitrary provider payloads.
export function generationFailureMessage(status: string, error: unknown, credits: number, providerId?: string | null) {
  const creditNotice = credits > 0
    ? "Your credits were returned."
    : "No Reelform credits were charged.";
  let reason = "The video could not complete. Please contact support with the generation ID.";
  if (status === "nsfw") {
    reason = "Higgsfield’s API content filter blocked this generation after Reelform submitted it. The provider did not identify which input triggered the filter. A successful generation on Higgsfield’s website does not guarantee acceptance through its API. If the same inputs work there, contact Higgsfield support to investigate the API rejection.";
    // A provider request ID lets support locate the rejection without sharing uploads.
    if (providerId && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(providerId)) {
      reason += ` Higgsfield request ID: ${providerId}.`;
    }
  } else if (status === "canceled") {
    reason = "The video generation was canceled.";
  } else if (
    typeof error === "string" &&
    error.includes("Your credit balance is too low to complete this request")
  ) {
    reason = "Generation is unavailable because Reelform’s video provider balance needs a top-up. Please contact Reelform support; adding credits to your Reelform account will not resolve this.";
  }
  return `${reason} ${creditNotice}`;
}
