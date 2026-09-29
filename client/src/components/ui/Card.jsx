export default function Card({ children, className = "", glass = true }) {
  return <section className={`${glass ? "glass-card" : "soft-card"} ${className}`}>{children}</section>;
}
