"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Play,
  Pause,
  Upload,
  ImagePlus,
  WandSparkles,
  Plus,
  Minus,
  Menu,
  X,
  Film,
  Check,
  MoveUpRight,
} from "lucide-react";
import Brand from "./brand";
import { scenes } from "@/lib/scenes";

const faqs = [
  [
    "What is Reelform?",
    "Reelform is your studio for AI roleplay. Start with a real clip of yourself, add photos for the look you have in mind, and describe your alternate reality. AI reimagines your outfit, surroundings, and objects using your footage as the starting point.",
  ],
  [
    "Can I use my own video and reference photos?",
    "Yes. Upload an MP4 clip and up to four JPG, PNG, or WebP reference images. Short, well-lit clips with a clearly visible subject and simple movements are a good starting point. Use photos to guide the outfit, location, or object you want.",
  ],
  [
    "Will it still look and move like me?",
    "The original video guides the action, while your prompt and reference photos guide the changes. AI can vary faces, motion, and fine details, so results may need another iteration. Avoid fast cuts and heavily obscured faces for a clearer starting point.",
  ],
  [
    "What powers the transformations?",
    "Video generation is powered by Higgsfield. Reelform sends your footage, references, and prompt to the selected video editing model, then brings the completed result back to the studio.",
  ],
  [
    "Are the examples real transformations?",
    "The landing-page clips are original AI-generated concept scenes created with Higgsfield. They illustrate the kinds of worlds you can imagine; they are not before-and-after edits of user footage.",
  ],
  [
    "What can I create?",
    "Try a new outfit, a dream destination, a different ride, or an entirely fictional world. Use footage and references you have permission to use, and label realistic AI edits when you share them so viewers understand they are altered.",
  ],
];
function Reel({
  scene,
  className = "",
  paused,
}: {
  scene: (typeof scenes)[number];
  className?: string;
  paused: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (paused) video.current?.pause();
    else video.current?.play().catch(() => {});
  }, [paused]);
  return (
    <article className={`reel ${className}`}>
      <div className="reel-media">
        <video
          ref={video}
          muted
          loop
          playsInline
          preload="metadata"
          poster={scene.poster}
          aria-label={scene.title}
        >
          <source src={scene.video} type="video/mp4" />
        </video>
        <a
          href={`/studio?scene=${scene.id}`}
          className="reel-action"
          aria-label={`Try ${scene.title}`}
        >
          <ArrowUpRight size={21} />
        </a>
      </div>
      <div className="reel-caption">
        <div>
          <p>{scene.category}</p>
          <h3>{scene.title}</h3>
        </div>
        <span>{scene.location}</span>
      </div>
    </article>
  );
}
export default function Landing() {
  const ideaVideo = useRef<HTMLVideoElement>(null);
  const [menu, setMenu] = useState(false);
  const [paused, setPaused] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  useEffect(() => {
    setPaused(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  useEffect(() => {
    if (paused) ideaVideo.current?.pause();
    else ideaVideo.current?.play().catch(() => {});
  }, [paused]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="header">
        <div className="nav-wrap">
          <Brand />
          <nav
            className={menu ? "nav-links is-open" : "nav-links"}
            aria-label="Main navigation"
          >
            <a href="#explore" onClick={() => setMenu(false)}>
              Explore
            </a>
            <a href="#how-it-works" onClick={() => setMenu(false)}>
              How it works
            </a>
            <a href="#faq" onClick={() => setMenu(false)}>
              FAQs
            </a>
          </nav>
          <a href="/studio" className="button button-small">
            Open studio <ArrowUpRight size={16} />
          </a>
          <button
            className="menu-toggle icon-button"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <Sparkles size={14} /> REAL FOOTAGE. UNLIMITED IMAGINATION.
            </div>
            <h1>
              Same you.
              <br className="mobile-break" /> <span>New reality.</span>
            </h1>
            <p>
              Your video. Any outfit, any place, any life.
              <br />
              Turn the everyday into your next main character moment.
            </p>
            <div className="hero-buttons">
              <a href="/studio" className="button">
                Reform your reality <ArrowUpRight size={18} />
              </a>
              <a href="#explore" className="button button-outline">
                <Play size={15} fill="currentColor" /> See what’s possible
              </a>
            </div>
          </div>
          <div className="showcase" id="explore">
            <Reel scene={scenes[1]} className="reel-left" paused={paused} />
            <Reel scene={scenes[0]} className="reel-center" paused={paused} />
            <Reel scene={scenes[2]} className="reel-right" paused={paused} />
          </div>
          <div className="showcase-footer">
            <span>
              <span className="higgsfield-symbol">h</span> Original scenes made
              with <strong>Higgsfield</strong>
            </span>
            <button onClick={() => setPaused(!paused)} className="play-control">
              {paused ? <Play size={13} /> : <Pause size={13} />}{" "}
              {paused ? "Play previews" : "Pause previews"}
            </button>
          </div>
        </section>
        <section className="how-section section-wrap" id="how-it-works">
          <div className="section-heading">
            <span className="section-label">
              A LITTLE YOU. A LOT OF POSSIBILITY.
            </span>
            <h2>
              Your imagination.
              <br />
              Now in motion.
            </h2>
            <p>No studio. No costume changes. Just a clip and an idea.</p>
          </div>
          <div className="steps">
            <article>
              <div className="step-icon">
                <Upload size={23} />
              </div>
              <h3>Start with the real you.</h3>
              <p>
                Upload a video of yourself. A walk, a pose, a perfectly ordinary
                moment.
              </p>
              <span className="step-detail">
                <Film size={14} /> Your original footage
              </span>
            </article>
            <article>
              <div className="step-icon">
                <ImagePlus size={23} />
              </div>
              <h3>Set the scene.</h3>
              <p>
                Add reference photos and describe the outfit, place, or life
                you’re imagining.
              </p>
              <span className="step-detail">
                <Plus size={14} /> Photos + your imagination
              </span>
            </article>
            <article>
              <div className="step-icon">
                <WandSparkles size={23} />
              </div>
              <h3>Meet your alternate reality.</h3>
              <p>
                Generate your transformation, preview the result, and download
                your new story.
              </p>
              <span className="step-detail">
                <Check size={14} /> Ready for your next post
              </span>
            </article>
          </div>
        </section>
        <section className="idea-section section-wrap">
          <div className="idea-image">
            <video
              ref={ideaVideo}
              muted
              loop
              playsInline
              preload="metadata"
              poster={scenes[0].poster}
              src={scenes[0].video}
              aria-label="AI-generated man beside a Lamborghini"
            />
          </div>
          <div className="idea-copy">
            <div className="eyebrow">
              <Sparkles size={14} /> YOU’RE THE DIRECTOR
            </div>
            <h2>
              Dream a little
              <br />
              differently.
            </h2>
            <p>
              That walk to your car? It could be your arrival in Beverly Hills.
              Keep the moment. Reimagine everything around it.
            </p>
            <div className="prompt-example">
              <span>
                <WandSparkles size={15} /> THE PROMPT
              </span>
              <p>
                “Put me in a tailored suit, swap my car for a Lamborghini SVJ,
                and take me to Beverly Hills.”
              </p>
            </div>
            <a className="text-link" href="/studio?scene=arrival">
              Make this your reality <ArrowRight size={18} />
            </a>
          </div>
        </section>
        <section className="faq-section section-wrap" id="faq">
          <div className="section-heading">
            <h2>
              A few things
              <br />
              you might be wondering.
            </h2>
            <p>A new reality starts with a little curiosity.</p>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a], i) => (
              <article
                className={`faq-item ${openFaq === i ? "expanded" : ""}`}
                key={q}
              >
                <h3>
                  <button
                    aria-expanded={openFaq === i}
                    aria-controls={`faq-${i}`}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    {q}
                    {openFaq === i ? <Minus size={18} /> : <Plus size={18} />}
                  </button>
                </h3>
                <div id={`faq-${i}`} hidden={openFaq !== i}>
                  <p>{a}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="last-call section-wrap">
          <div>
            <span className="section-label">
              YOUR NEXT CHAPTER IS UP TO YOU
            </span>
            <h2>
              Reality could use
              <br />a little imagination.
            </h2>
          </div>
          <a href="/studio" className="button button-dark">
            Let’s make it happen <MoveUpRight size={18} />
          </a>
        </section>
      </main>
      <footer className="footer section-wrap">
        <Brand />
        <span>Real you. Reimagined.</span>
        <span>© {new Date().getFullYear()} Reelform</span>
      </footer>
    </>
  );
}
