/**
 * /stage is the static projector in the repo root (index.html / index.js),
 * live-wired through engine-bridge.js. Edit those files, not a React scene.
 */
export default function StagePage() {
  return (
    <iframe
      title="The Predictive Engine"
      src="/stage-static/index.html"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      className="block h-dvh w-full border-0"
      style={{ width: "100%", height: "100dvh" }}
    />
  );
}
