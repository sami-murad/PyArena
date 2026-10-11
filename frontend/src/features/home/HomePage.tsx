import { SquareTerminal, Swords } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/config/navigation";
import { websitesInfo } from "@/config/websitesInfo";
import { LiveSample } from "@/features/home/components/LiveSample";
import { Parallax } from "@/features/scroll/Parallax";
import { Reveal } from "@/features/scroll/Reveal";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function HomePage() {
  useDocumentTitle();
  return (
    <div className="home">
      <section className="hero">
        <div className="hero__decor">
          <Parallax speed={0.18}>
            <div className="hero__glow hero__glow--a" />
          </Parallax>
          <Parallax speed={-0.1}>
            <div className="hero__glow hero__glow--b" />
          </Parallax>
        </div>
        <div className="hero__text">
          <h1 className="hero__title">
            Write Python here.
            <br />
            Race your friends with it.
          </h1>
          <p className="hero__lead">
            {websitesInfo.name} is a Python playground that runs your code in a sandbox, plus private rooms where everyone
            gets the same problem and the first correct solution wins.
          </p>
          <div className="hero__actions">
            <ButtonLink to={routes.playground} variant="primary" size="lg" icon={<SquareTerminal size={18} aria-hidden />}>
              Open the playground
            </ButtonLink>
            <ButtonLink to={routes.competitions} variant="secondary" size="lg" icon={<Swords size={18} aria-hidden />}>
              Start a competition
            </ButtonLink>
          </div>
        </div>
        <LiveSample />
      </section>

      <section className="paths" aria-label="What you can do">
        <Reveal className="path">
          <h2 className="path__title">The playground</h2>
          <p>
            A full editor with syntax highlighting. Type input for <code>input()</code>, run, and read the output. When
            something breaks you see the real traceback plus a plain-language note on what it means.
          </p>
          <ul className="path__facts">
            <li>No install: Python runs on the server, isolated from everything else.</li>
            <li>Infinite loops and runaway output are stopped for you.</li>
            <li>Sign in to keep snippets and come back to them.</li>
          </ul>
        </Reveal>
        <Reveal className="path" delay={120}>
          <h2 className="path__title">Live competitions</h2>
          <p>
            Open a room, send the code to friends, ready up. The server starts everyone at the same instant and checks
            each submission against hidden tests.
          </p>
          <ol className="path__steps">
            <li>Everyone sees the same question when the countdown ends.</li>
            <li>Submit as often as you like; each try is judged in the order it arrived.</li>
            <li>The first submission that passes every test wins the round.</li>
          </ol>
        </Reveal>
      </section>
    </div>
  );
}
