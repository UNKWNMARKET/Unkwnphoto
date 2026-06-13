interface IntroProps {
  onEnter: () => void;
  leaving: boolean;
}

export default function Intro({ onEnter, leaving }: IntroProps) {
  return (
    <button
      type="button"
      className={`intro${leaving ? " intro-leaving" : ""}`}
      onClick={onEnter}
      disabled={leaving}
      aria-label="Enter Unkwnphoto"
    >
      <div className="intro-inner">
        <h1 className="intro-title">Unkwnphoto</h1>
        <span className="intro-cta">click to enter</span>
      </div>
    </button>
  );
}
