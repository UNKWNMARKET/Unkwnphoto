interface IntroProps {
  onEnter: () => void;
}

export default function Intro({ onEnter }: IntroProps) {
  return (
    <button
      type="button"
      className="intro"
      onClick={onEnter}
      aria-label="Enter Unkwnphoto"
    >
      <div className="intro-inner">
        <h1 className="intro-title">Unkwnphoto</h1>
        <span className="intro-cta">click to enter</span>
      </div>
    </button>
  );
}
