import Brand from "@/components/reelform/brand";
export const metadata = { title: "Connect Higgsfield | Reelform" };
export default function Setup() {
  return (
    <main className="setup-page">
      <Brand />
      <h1>Connect your generation engine.</h1>
      <p>
        Reelform uses Higgsfield to transform your videos. The landing-page
        examples are ready to explore. To generate new transformations, the site
        owner needs to connect a Higgsfield API account.
      </p>
      <h2>Get your API credentials</h2>
      <p>
        Create an API key in the{" "}
        <a
          href="https://console.higgsfield.ai/"
          target="_blank"
          rel="noreferrer"
        >
          Higgsfield API console
        </a>
        . API billing is separate from the Higgsfield website subscription and
        requires a funded API balance.
      </p>
      <h2>Add them securely</h2>
      <p>
        For this hosted site, add these two secrets in the site’s environment
        settings. For local development, add them to the ignored{" "}
        <code>.env</code> file and restart the development server. Never put
        secret values in browser code or commit them to Git.
      </p>
      <pre>
        {"HF_API_KEY_ID=your_key_id\nHF_API_KEY_SECRET=your_key_secret"}
      </pre>
      <h2>You’re ready to reform</h2>
      <p>
        Return to the studio, upload an MP4 video, add your references, and
        describe the transformation. Reelform checks the connection
        automatically. No OpenAI key is required.
      </p>
      <p>
        <a href="/studio">Back to your studio →</a>
      </p>
    </main>
  );
}
