import type { ShapeType } from "../types";

interface ShapeIconProps {
  type: ShapeType;
  className?: string;
}

export function ShapeIcon({ type, className }: ShapeIconProps) {
  const classes = className ? `shape-icon ${className}` : "shape-icon";

  return (
    <svg
      className={classes}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      {shapeArtwork(type)}
    </svg>
  );
}

function shapeArtwork(type: ShapeType) {
  switch (type) {
    case "box":
      return (
        <rect
          className="shape-icon__face"
          x="6"
          y="6"
          width="20"
          height="20"
        />
      );
    case "wedge":
      return <path className="shape-icon__face" d="M5 6.5 27 16 5 25.5Z" />;
    case "ramp":
      return <path className="shape-icon__face" d="M5 26h22V6Z" />;
    case "trapezoid":
      return (
        <path
          className="shape-icon__face"
          d="M5 6.5 27 10.5v11L5 25.5Z"
        />
      );
    case "tapered-block":
      return <path className="shape-icon__face" d="M10 5h12l6 22H4Z" />;
    case "cylinder":
      return (
        <>
          <path
            className="shape-icon__face"
            d="M7 8v16c0 2.2 4 4 9 4s9-1.8 9-4V8c0 2.2-4 4-9 4s-9-1.8-9-4Z"
          />
          <path
            className="shape-icon__detail"
            d="M7 8c0-2.2 4-4 9-4s9 1.8 9 4"
          />
        </>
      );
    case "sphere":
      return (
        <>
          <circle className="shape-icon__face" cx="16" cy="16" r="11.5" />
          <ellipse
            className="shape-icon__detail"
            cx="16"
            cy="16"
            rx="5.5"
            ry="11.5"
          />
          <path className="shape-icon__detail" d="M4.5 16h23" />
        </>
      );
    case "cone":
      return (
        <>
          <path
            className="shape-icon__face"
            d="M16 4 27 25c-1.5 2.7-20.5 2.7-22 0Z"
          />
          <path
            className="shape-icon__detail"
            d="M5 25c1.5-2.7 20.5-2.7 22 0"
          />
        </>
      );
  }
}
