// Only expose known, actionable categories, never arbitrary provider payloads.
export function generationFailureMessage(status: string, error: unknown, credits: number) {
  const creditNotice = credits > 0
    ? "Your credits were returned."
    : "No Reelform credits were charged.";
  let reason = "The video could not complete. Please contact support with the generation ID.";
  if (status === "nsfw") {
    reason = "Higgsfield’s content filter blocked this generation. The provider did not identify which input triggered the filter. If you believe this is a mistake, contact support with the generation ID.";
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
