import { Children, cloneElement, isValidElement } from "react";

export default function StaggerContainer({ children, className = "" }) {
  const animatedChildren = Children.map(children, (child, index) => {
    if (!isValidElement(child)) return child;

    return cloneElement(child, {
      staggerIndex: index,
    });
  });

  return (
    <div className={`stagger-container ${className}`.trim()}>
      {animatedChildren}
    </div>
  );
}
