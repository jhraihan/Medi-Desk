export default function Card({ as: Tag = "div", tone = "glass", className = "", children, ...rest }) {
  const tones = {
    glass: "glass",
    strong: "glass-strong",
    tinted: "glass-tinted",
  };

  return (
    <Tag className={`rounded-2xl ${tones[tone]} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
