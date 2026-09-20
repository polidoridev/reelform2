"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from "lucide-react";
import { scenes, type Scene } from "@/lib/scenes";

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 42 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.85, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
export function SceneVideo({
  scene,
  paused,
  className = "",
}: {
  scene: Scene;
  paused: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const near = useInView(ref, { margin: "200px", once: true });
  const visible = useInView(ref, { amount: 0.05 });
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (paused || !visible) video.pause();
    else video.play().catch(() => {});
  }, [paused, visible, near]);
  return (
    <video
      ref={ref}
      src={near ? scene.video : undefined}
      className={className}
      muted
      loop
      playsInline
      preload="none"
      poster={scene.poster}
      aria-label={`AI concept: ${scene.title}`}
    />
  );
}
function FanCard({
  scene,
  index,
  progress,
  paused,
}: {
  scene: Scene;
  index: number;
  progress: MotionValue<number>;
  paused: boolean;
}) {
  const reduced = useReducedMotion();
  const offset = index - 2;
  const y = useTransform(
    progress,
    [0, 0.55],
    [Math.abs(offset) * 27, Math.abs(offset) * -28],
  );
  const x = useTransform(progress, [0, 0.55], [offset * -19, offset * 19]);
  const rotate = useTransform(progress, [0, 0.5], [offset * 3.7, 0]);
  const scale = useTransform(
    progress,
    [0, 0.55],
    [index === 2 ? 1.035 : 0.98, 1.04],
  );
  return (
    <motion.article
      className={`fan-card fan-card-${index}`}
      style={reduced ? {} : { y, x, rotate, scale }}
    >
      <div className="fan-clip">
        <SceneVideo scene={scene} paused={paused} />
        <a
          className="scene-open"
          href={`/studio?scene=${scene.id}`}
          aria-label={`Create ${scene.title}`}
        >
          <ArrowUpRight size={20} />
        </a>
      </div>
      <div className="fan-caption">
        <span>{scene.shortLabel}</span>
        <ArrowUpRight size={14} />
      </div>
    </motion.article>
  );
}
export function HeroCinema({ paused }: { paused: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.75", "end start"],
  });
  const selections = [scenes[4], scenes[2], scenes[5], scenes[3], scenes[6]];
  return (
    <div ref={ref} className="hero-cinema">
      <div className="fan-row">
        {selections.map((scene, index) => (
          <FanCard
            key={scene.id}
            scene={scene}
            index={index}
            progress={scrollYProgress}
            paused={paused}
          />
        ))}
      </div>
    </div>
  );
}
export function WorldGallery({
  paused,
  onToggle,
}: {
  paused: boolean;
  onToggle: () => void;
}) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);
  const [compact, setCompact] = useState(true);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });
  const x = useTransform(scrollYProgress, [0, 1], [0, -distance]);
  const active = !compact && !reduced;
  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const measure = () => {
      setCompact(query.matches);
      if (track.current)
        setDistance(
          Math.max(0, track.current.scrollWidth - window.innerWidth + 96),
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (track.current) observer.observe(track.current);
    query.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);
  function move(direction: number) {
    if (!active) {
      track.current?.parentElement?.scrollBy({
        left: direction * 340,
        behavior: reduced ? "instant" : "smooth",
      });
      return;
    }
    const top = section.current!.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top:
        top +
        Math.max(
          0,
          Math.min(
            distance,
            scrollYProgress.get() * distance + direction * 390,
          ),
        ),
      behavior: "smooth",
    });
  }
  function focusCard(index: number) {
    if (!active || !section.current) return;
    const target = Math.max(0, Math.min(distance, index * 360 - 180));
    const current = scrollYProgress.get() * distance;
    if (target > current + window.innerWidth - 450 || target < current - 100) {
      window.scrollTo({
        top:
          section.current.getBoundingClientRect().top + window.scrollY + target,
        behavior: "instant",
      });
    }
  }
  return (
    <section
      ref={section}
      className={`worlds-section ${active ? "is-scroll-gallery" : "is-native-gallery"}`}
      id="explore"
      style={active ? { height: `calc(100svh + ${distance}px)` } : undefined}
    >
      <div className="worlds-sticky">
        <div className="worlds-heading">
          <Reveal>
            <span className="section-label">A TASTE OF THE GOOD LIFE</span>
            <h2>
              Which life are
              <br />
              we living today?
            </h2>
            <p>Yachts. Villas. Dream cars. Make the lifestyle yours.</p>
          </Reveal>
          <div className="gallery-controls">
            <button
              onClick={onToggle}
              className="gallery-play"
              aria-label={paused ? "Play all previews" : "Pause all previews"}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
            <button
              onClick={() => move(-1)}
              className="gallery-arrow"
              aria-label="Previous scenes"
            >
              <ArrowLeft size={20} />
            </button>
            <button
              onClick={() => move(1)}
              className="gallery-arrow"
              aria-label="Next scenes"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
        <div className="worlds-viewport">
          <motion.div
            ref={track}
            className="worlds-track"
            style={active ? { x } : undefined}
          >
            {scenes.map((scene, index) => (
              <article className="world-card" key={scene.id}>
                <div className="world-media">
                  <SceneVideo scene={scene} paused={paused} />
                  <a
                    href={`/studio?scene=${scene.id}`}
                    onFocus={() => focusCard(index)}
                    className="world-create"
                    aria-label={`Create ${scene.title}`}
                  >
                    Make it yours <ArrowUpRight size={17} />
                  </a>
                </div>
                <div className="world-caption">
                  <div>
                    <span>{scene.category}</span>
                    <h3>{scene.title}</h3>
                  </div>
                  <span className="world-location">{scene.location}</span>
                </div>
              </article>
            ))}
          </motion.div>
        </div>
        <div className="worlds-bottom">
          <span>Original AI concept scenes generated with Higgsfield</span>
          <div className="gallery-progress" aria-hidden="true">
            <motion.div
              style={active ? { scaleX: scrollYProgress } : { scaleX: 1 }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
export function ParallaxFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [50, -50]);
  const rotate = useTransform(scrollYProgress, [0, 1], [-3, 3]);
  return (
    <motion.div
      ref={ref}
      className={className}
      style={reduced ? {} : { y, rotate }}
    >
      {children}
    </motion.div>
  );
}
