export default function StaggerItem({
  children,
  className = "",
  staggerIndex = 0,
}) {
  const delayClass = `stagger-delay-${Math.min(staggerIndex, 12)}`;

  return (
    <div className={`stagger-item ${delayClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
