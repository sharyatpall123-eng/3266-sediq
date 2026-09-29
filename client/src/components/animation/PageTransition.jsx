export default function PageTransition({ children, className = "" }) {
  return (
    <div className={`page-enter ${className}`.trim()}>
      {children}
    </div>
  );
}
