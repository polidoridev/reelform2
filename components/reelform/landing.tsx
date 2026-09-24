"use client";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
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
  Check,
  Aperture,
} from "lucide-react";
import Brand from "./brand";
import Link from "next/link";
import { scenes } from "@/lib/scenes";
import { useCases } from "@/lib/use-cases";
import { faqs } from "./faqs";
import {
  WorldGallery,
  Reveal,
  SceneVideo,
  ParallaxFrame,
} from "./motion-scenes";
import "./cinema.css";

const examplePrompt =
  "“Transfer this dancer’s movement to the character in my reference photo.”";

const steps = [
  {
    icon: Upload,
    title: "Start with your footage.",
    description:
      "A dance clip, a site walkthrough, or a product shot. Upload a short video with a clear subject and steady motion.",
    detail: "Your clip is the starting point",
  },
  {
    icon: ImagePlus,
    title: "Choose what to change.",
    description:
      "Choose Motion Transfer for a new character or Object Swap for a replacement object. Add reference photos and describe the edit.",
    detail: "A reference image + your direction",
  },
  {
    icon: WandSparkles,
    title: "Generate your next edit.",
    description:
      "Review the credit cost, generate your video, and check the result. Refine your references or prompt, then download the version you like.",
    detail: "Preview, refine, download",
  },
];
export default function Landing() {
  const [menu, setMenu] = useState(false);
  const [paused, setPaused] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const reduced = useReducedMotion();
  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: hero,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 0.65], [0, 100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.38], [1, 0]);
  useEffect(() => {
    // Read the browser preference after hydration to keep SSR deterministic.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaused(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return (
    <div className="cinema-page">
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
            <a href="/pricing">Pricing</a>
            <Link prefetch={false} href="/community">Community</Link>
            <a href="/account">My account</a>
          </nav>
          <a href="/login?next=%2Fstudio" className="button button-small">
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
        <section ref={hero} className="cinema-hero">
          <div className="hero-gradient" aria-hidden="true" />
          <motion.div
            className="hero-copy"
            style={reduced ? {} : { y: heroY, opacity: heroOpacity }}
          >
            <motion.div
              className="eyebrow"
              initial={false}
              animate={{ opacity: 1 }}
            >
              <Sparkles size={14} /> AI MOTION TRANSFER & OBJECT SWAP
            </motion.div>
            <motion.h1
              initial={reduced ? false : { opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            >
              Your footage.
              <br className="mobile-break" /> <span>New possibilities.</span>
            </motion.h1>
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.12 }}
            >
              Transfer motion to a character. Swap objects in a scene.
              <br />
              Create something for your audience, your clients, or just for fun.
            </motion.p>
            <div className="director-prompt hero-prompt">
              <span>
                <Sparkles size={14} /> TRY THIS
              </span>
              <p>
                <span className="sr-only">{examplePrompt}</span>
                <span aria-hidden="true">
                  {Array.from(examplePrompt.matchAll(/\S+/g), (match) => (
                    <span key={match.index}>
                      <span className="prompt-word">
                        {Array.from(match[0], (letter, index) => (
                          <span
                            className="prompt-letter"
                            key={index}
                            style={{
                              animationDelay: `${-(match.index + index) * 0.055}s`,
                            }}
                          >
                            {letter}
                          </span>
                        ))}
                      </span>{" "}
                    </span>
                  ))}
                </span>
              </p>
              <a
                href="/studio?useCase=character-remix"
                aria-label="Try character motion transfer"
              >
                <ArrowUpRight size={20} />
              </a>
            </div>
            <motion.div
              className="hero-buttons"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <a href="/login?next=%2Fstudio" className="button">
                Start creating <ArrowUpRight size={18} />
              </a>
              <a href="#explore" className="hero-secondary">
                <Play size={14} fill="currentColor" /> See what’s possible
              </a>
            </motion.div>
          </motion.div>
          <div className="transfer-choices" aria-label="Choose your video tool">
            <a href="/studio?useCase=character-remix">
              <span className="section-label">GENJUTSU MOTION TRANSFER</span>
              <h2>New character.<br />Same starting moves.</h2>
              <p>Use a performance to guide a character from your reference photo. Try dance edits, music-video remixes, and animated personas.</p>
              <span className="text-link">Transfer motion <ArrowUpRight size={18} /></span>
            </a>
            <a href="/studio?useCase=product-swap">
              <span className="section-label">GENJUTSU OBJECT SWAP</span>
              <h2>Same shot.<br />Something new in it.</h2>
              <p>Use reference photos to replace an object in your footage. Explore product variations, equipment concepts, and fresh looks.</p>
              <span className="text-link">Swap an object <ArrowUpRight size={18} /></span>
            </a>
          </div>
          <div className="cinema-credit">
            <span>
              <Aperture size={16} /> Directed by you. Powered by{" "}
              <strong>Higgsfield.</strong>
            </span>
            <button onClick={() => setPaused(!paused)}>
              {paused ? <Play size={12} /> : <Pause size={12} />}{" "}
              {paused ? "Play previews" : "Pause previews"}
            </button>
          </div>
        </section>
        <section className="possibility-section">
          <Reveal>
            <span className="section-label">
              ONE STUDIO. MANY WAYS TO CREATE.
            </span>
            <h2>
              For the work you do.
              <br />
              <span>And the things you make.</span>
            </h2>
            <p>
              A character remix for your feed. A visual concept for your next project.
              <br />
              Start with footage you already have and explore what it could become.
            </p>
          </Reveal>
        </section>
        <section className="use-case-section" aria-labelledby="use-case-title">
          <h2 id="use-case-title">What will you make?</h2>
          <div className="use-case-list">
            {useCases.map((item) => (
              <a key={item.id} href={`/studio?useCase=${item.id}`}>
                <span className="section-label">{item.audience}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span className="text-link">Try this idea <ArrowUpRight size={16} /></span>
              </a>
            ))}
          </div>
        </section>
        <WorldGallery paused={paused} onToggle={() => setPaused(!paused)} />
        <section className="workflow-section" id="how-it-works">
          <div className="workflow-intro">
            <Reveal>
              <span className="section-label">
                BRING A CLIP. GIVE IT DIRECTION.
              </span>
              <h2>
                From source clip
                <br />
                to <span>your next edit.</span>
              </h2>
              <p>
                Choose your tool, upload your references,
                <br />
                and tell Reelform what you want to change.
              </p>
              <a className="text-link" href="/studio">
                Meet your creative studio <ArrowUpRight size={18} />
              </a>
            </Reveal>
            <ParallaxFrame className="workflow-photo">
              <img
                src={scenes[3].poster}
                alt="AI concept of a private overwater villa in the Maldives"
                loading="lazy"
              />
              <span className="photo-caption">
                AI concept scene. Your footage comes next.
              </span>
            </ParallaxFrame>
          </div>
          <div className="workflow-steps">
            {steps.map((step, i) => (
              <Reveal
                key={step.title}
                className="workflow-step"
                delay={i * 0.04}
              >
                <div className="workflow-step-top">
                  <span className="step-number">0{i + 1}</span>
                  <step.icon size={25} strokeWidth={1.5} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <span className="workflow-detail">
                  <Check size={14} />
                  {step.detail}
                </span>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="director-section">
          <div className="director-wash" aria-hidden="true" />
          <ParallaxFrame className="director-film">
            <SceneVideo scene={scenes[0]} paused={paused} />
            <span className="director-play">
              <Play size={14} fill="currentColor" /> AI concept preview
            </span>
          </ParallaxFrame>
          <Reveal className="director-copy">
            <span className="section-label">YOU’RE THE DIRECTOR</span>
            <h2>
              Give your footage
              <br />
              <span>a new role.</span>
            </h2>
            <p>
              Turn a performance into a character edit, or try a new object in an existing shot. Genjutsu Motion Transfer and Object Swap give you two ways to start.
            </p>

            <a className="text-link" href="/studio?useCase=character-remix">
              Try motion transfer <ArrowRight size={18} />
            </a>
          </Reveal>
        </section>
        <section className="faq-section" id="faq">
          <Reveal className="section-heading">
            <h2>
              A little curious?
              <br />
              <span>Good. So are we.</span>
            </h2>
            <p>A few things before your first edit.</p>
          </Reveal>
          <div className="faq-list">
            {faqs.map(([q, a], i) => (
              <Reveal key={q} delay={i * 0.03}>
                <article
                  className={`faq-item ${openFaq === i ? "expanded" : ""}`}
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
              </Reveal>
            ))}
          </div>
        </section>
        <section className="cinematic-cta">
          <div className="cta-gradient" aria-hidden="true" />
          <div className="cta-orbit cta-orbit-left">
            <ParallaxFrame>
              <SceneVideo scene={scenes[4]} paused={paused} />
            </ParallaxFrame>
          </div>
          <div className="cta-orbit cta-orbit-right">
            <ParallaxFrame>
              <SceneVideo scene={scenes[2]} paused={paused} />
            </ParallaxFrame>
          </div>
          <Reveal className="cta-copy">
            <span className="section-label">THE NEXT SCENE IS YOURS</span>
            <h2>
              Start with a clip.
              <br />
              See what <span>you can make.</span>
            </h2>
            <p>For your next post, pitch, project, or experiment.</p>
            <a className="button" href="/studio">
              Let’s make it happen <ArrowUpRight size={19} />
            </a>
          </Reveal>
        </section>
      </main>
      <footer className="footer">
        <div className="footer-top">
          <Brand />
          <span>Your footage. New possibilities.</span>
          <a href="/studio">
            Create your next video <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Reelform</span>
          <span>Made for people who make things.</span>
        </div>
      </footer>
    </div>
  );
}
