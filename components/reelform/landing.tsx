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
import { faqs } from "./faqs";
import {
  HeroCinema,
  WorldGallery,
  Reveal,
  SceneVideo,
  ParallaxFrame,
} from "./motion-scenes";
import "./cinema.css";

const examplePrompt =
  "“Put me in a tailored suit, swap my car for a Lamborghini SVJ, and take me to Beverly Hills.”";

const steps = [
  {
    icon: Upload,
    title: "Start with the real you.",
    description:
      "A walk to your car. A pose in your bedroom. A perfectly ordinary moment. Upload a short clip and make it your starting point.",
    detail: "Your video, your natural movement",
  },
  {
    icon: ImagePlus,
    title: "Give your imagination a reference.",
    description:
      "The suit. The supercar. The place you’ve always wanted to go. Add photos of the look you love, then tell us what to change.",
    detail: "Reference photos + a little direction",
  },
  {
    icon: WandSparkles,
    title: "Step into something different.",
    description:
      "Let AI reimagine the scene around you. Preview your new reality, download it, and give your next story a plot twist.",
    detail: "Generate, preview, make it yours",
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
              <Sparkles size={14} /> YOUR REALITY IS JUST THE STARTING POINT
            </motion.div>
            <motion.h1
              initial={reduced ? false : { opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            >
              Same you.
              <br className="mobile-break" /> <span>New reality.</span>
            </motion.h1>
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.12 }}
            >
              Your video. The yacht. The villa. The dream car.
              <br />
              Give your everyday a main character moment.
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
                href="/studio?scene=arrival"
                aria-label="Try the Lamborghini transformation"
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
                Reform your reality <ArrowUpRight size={18} />
              </a>
              <a href="#explore" className="hero-secondary">
                <Play size={14} fill="currentColor" /> See what’s possible
              </a>
            </motion.div>
          </motion.div>
          <HeroCinema paused={paused} />
          <div className="cinema-credit">
            <span>
              <Aperture size={16} /> Imagined by you. Powered by{" "}
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
              A LITTLE YOU. A LOT OF POSSIBILITY.
            </span>
            <h2>
              You don’t need a different life.
              <br />
              <span>Just a different take.</span>
            </h2>
            <p>
              The same walk. The same look. An entirely different world.
              <br />
              Reelform turns the footage you already have into the life you’re
              imagining.
            </p>
          </Reveal>
        </section>
        <WorldGallery paused={paused} onToggle={() => setPaused(!paused)} />
        <section className="workflow-section" id="how-it-works">
          <div className="workflow-intro">
            <Reveal>
              <span className="section-label">
                YOU BRING THE MAIN CHARACTER
              </span>
              <h2>
                From everyday
                <br />
                to <span>anything.</span>
              </h2>
              <p>
                No film crew. No costume changes.
                <br />
                Just a clip and a little imagination.
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
                A new scene. Still your story.
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
              <Play size={14} fill="currentColor" /> A little main character
              energy
            </span>
          </ParallaxFrame>
          <Reveal className="director-copy">
            <span className="section-label">YOU’RE THE DIRECTOR</span>
            <h2>
              Dream a little
              <br />
              <span>differently.</span>
            </h2>
            <p>
              That walk to your car? It could be your arrival in Beverly Hills.
              Keep the moment. Reimagine everything around it.
            </p>

            <a className="text-link" href="/studio?scene=arrival">
              Make this your reality <ArrowRight size={18} />
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
            <p>A few things before your next reality.</p>
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
              Go on.
              <br />
              Live a little <span>unreal.</span>
            </h2>
            <p>Your imagination looks good on you.</p>
            <a className="button" href="/studio">
              Let’s make it happen <ArrowUpRight size={19} />
            </a>
          </Reveal>
        </section>
      </main>
      <footer className="footer">
        <div className="footer-top">
          <Brand />
          <span>Real you. Reimagined.</span>
          <a href="/studio">
            Create your next reality <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Reelform</span>
          <span>Made for your imagination.</span>
        </div>
      </footer>
    </div>
  );
}
