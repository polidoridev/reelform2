"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowRight, Film, ImagePlus, Menu, Minus, Plus, Replace, Scissors, Upload, WandSparkles, X } from "lucide-react";
import Brand from "./brand";
import { useCases } from "@/lib/use-cases";
import { faqs } from "./faqs";
import { CookieSettingsButton } from "./cookie-consent";
import "./cinema.css";
import "./motion-home.css";

const presets = useCases.filter(item => item.model === "genjutsu-motion" && item.sourceVideo);
const faqSchema = {
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
};
const steps = [
  { icon: Upload, title: "Upload the movement", description: "Start with a clip of the performance you want to keep. Trim it in the studio if needed." },
  { icon: ImagePlus, title: "Add your character", description: "Upload a clear reference photo. Describe who to replace and what should stay the same." },
  { icon: WandSparkles, title: "Review and generate", description: "Choose your quality, check the exact credit cost, then generate and download your video." },
];

export default function Landing() {
  const [menu, setMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return (
    <div className="cinema-page motion-home">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="header">
        <div className="nav-wrap">
          <Brand />
          <nav className={menu ? "nav-links is-open" : "nav-links"} aria-label="Main navigation">
            <a href="#how-it-works" onClick={() => setMenu(false)}>How it works</a>
            <a href="#explore" onClick={() => setMenu(false)}>Motion presets</a>
            <Link prefetch={false} href="/pricing">Pricing</Link>
            <a href="#more-tools" onClick={() => setMenu(false)}>More tools</a>
            <Link prefetch={false} href="/account">My account</Link>
          </nav>
          <Link prefetch={false} href="/studio" className="button button-small">Motion Transfer <ArrowUpRight size={16} /></Link>
          <button className="menu-toggle icon-button" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="main">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
        <section className="motion-hero" aria-labelledby="motion-heading">
          <div className="motion-hero-copy">
            <span className="section-label">GENJUTSU MOTION TRANSFER</span>
            <h1 id="motion-heading">Your character.<br /><span>The same moves.</span></h1>
            <p>Transfer a video’s movement to your character. Bring a clip, add a reference photo, and make it yours.</p>
            <div className="motion-hero-actions">
              <Link prefetch={false} href="/studio" className="button">Start motion transfer <ArrowUpRight size={18} /></Link>
              <a href="#how-it-works" className="text-link">How it works <ArrowRight size={17} /></a>
            </div>
          </div>
        </section>
        <section className="motion-how" id="how-it-works" aria-labelledby="how-heading">
          <div className="motion-section-heading">
            <h2 id="how-heading">One clip. One photo. A new performance.</h2>
            <p>Motion Transfer is ready when you open the studio.</p>
          </div>
          <ol className="motion-steps">
            {steps.map((step, i) => <li key={step.title}><div><span>{i + 1}</span><step.icon size={22} strokeWidth={1.6} /></div><h3>{step.title}</h3><p>{step.description}</p></li>)}
          </ol>
        </section>
        <section className="motion-presets" id="explore" aria-labelledby="preset-heading">
          <div className="motion-section-heading">
            <h2 id="preset-heading">Need a starting clip?</h2>
            <p>Pick a motion preset, then add your reference photos. These are source clips for you to recast.</p>
          </div>
          <div className="motion-preset-grid">
            {presets.map(item => <article key={item.id}>
              <Link prefetch={false} href={`/studio?useCase=${item.id}`} className="motion-preset-image" aria-label={`Use ${item.shortLabel} preset`}>
                {/* Local preset posters retain their source framing without a remote image service. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.poster} alt={`${item.shortLabel} source video`} width={item.posterWidth ?? 1280} height={item.posterHeight ?? 720} loading="lazy" />
              </Link>
              <div className="motion-preset-info"><h3>{item.shortLabel}</h3><span>{item.referenceCount} reference photos</span></div>
              <Link prefetch={false} href={`/studio?useCase=${item.id}`} className="text-link">Use preset <ArrowUpRight size={16} /></Link>
            </article>)}
          </div>
        </section>
        <section className="motion-other-tools" id="more-tools" aria-labelledby="tools-heading">
          <div className="motion-section-heading"><h2 id="tools-heading">More ways to work with video.</h2><p>Looking for something beyond motion transfer? Start here.</p></div>
          <div className="motion-tool-list">
            <Link prefetch={false} href="/studio?useCase=product-swap"><Replace size={22} /><span><strong>Object Swap</strong><small>Replace a product, prop, or object in your footage.</small></span><ArrowUpRight size={20} /></Link>
            <Link prefetch={false} href="/cinemalab"><Film size={22} /><span><strong>CinemaLab</strong><small>Create a new scene from a prompt and optional references.</small></span><ArrowUpRight size={20} /></Link>
            <Link prefetch={false} href="/aura"><Scissors size={22} /><span><strong>Aura video editor</strong><small>Cut, arrange, and finish your footage.</small></span><ArrowUpRight size={20} /></Link>
          </div>
        </section>
        <section className="faq-section" id="faq">
          <div className="motion-section-heading"><h2>Before your first motion transfer.</h2></div>
          <div className="faq-list">{faqs.map(([question, answer], i) => <article className={`faq-item ${openFaq === i ? "expanded" : ""}`} key={question}>
            <h3><button aria-expanded={openFaq === i} aria-controls={`faq-${i}`} onClick={() => setOpenFaq(openFaq === i ? null : i)}>{question}{openFaq === i ? <Minus size={18} /> : <Plus size={18} />}</button></h3>
            <div id={`faq-${i}`} hidden={openFaq !== i}><p>{answer}</p></div>
          </article>)}</div>
        </section>
        <section className="motion-start"><h2>Give your character the next move.</h2><Link prefetch={false} href="/studio" className="button">Start motion transfer <ArrowUpRight size={18} /></Link><p>Exact credits shown before generation. <Link prefetch={false} href="/pricing">See plans and costs</Link>.</p></section>
      </main>
      <footer className="footer">
        <div className="footer-top"><Brand /><span>Your character. The same moves.</span></div>
        <nav className="footer-links" aria-label="Footer">
          <div><strong>Create</strong><Link prefetch={false} href="/studio">Motion Transfer</Link><Link prefetch={false} href="/studio?useCase=product-swap">Object Swap</Link><Link prefetch={false} href="/cinemalab">CinemaLab</Link><Link prefetch={false} href="/aura">Aura video editor</Link></div>
          <div><strong>Explore</strong><Link prefetch={false} href="/pricing">Pricing</Link><Link prefetch={false} href="/community">Community</Link><a href="#faq">FAQ</a><Link prefetch={false} href="/studio?trial=1">Try a free Seedance edit</Link></div>
          <div><strong>Account</strong><Link prefetch={false} href="/login">Sign in</Link><Link prefetch={false} href="/account">My account</Link><Link prefetch={false} href="/account?tab=creations">My creations</Link></div>
          <div><strong>Legal & contact</strong><Link prefetch={false} href="/privacy">Privacy policy</Link><Link prefetch={false} href="/terms">Terms of use</Link><CookieSettingsButton className="footer-link-button" /><a href="mailto:contact@polidori.dev">contact@polidori.dev</a></div>
        </nav>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} Reelform</span><span>Powered by Higgsfield.</span></div>
      </footer>
    </div>
  );
}
