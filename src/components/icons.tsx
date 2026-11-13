import type { ReactNode } from "react";

export type IconName =
  | "dashboard"
  | "inventory"
  | "warehouses"
  | "purchases"
  | "containers"
  | "movements"
  | "customers"
  | "suppliers"
  | "sales"
  | "reports"
  | "settings"
  | "menu"
  | "close"
  | "outbound"
  | "transfers"
  | "documents"
  | "chat"
  | "users"
  | "bell"
  | "offers"
  | "star";

type IconProps = {
  name: IconName;
  className?: string;
};

export function Icon({ name, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className ? `h-4 w-4 shrink-0 ${className}` : "h-4 w-4 shrink-0"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconShape(name)}
    </svg>
  );
}

function iconShape(name: IconName): ReactNode {
  switch (name) {
    case "dashboard":
      return (
        <>
          <rect x="2.25" y="2.25" width="4.5" height="4.5" />
          <rect x="9.25" y="2.25" width="4.5" height="4.5" />
          <rect x="2.25" y="9.25" width="4.5" height="4.5" />
          <rect x="9.25" y="9.25" width="4.5" height="4.5" />
        </>
      );
    case "inventory":
      return (
        <path d="M2.5 5.25 8 2.5l5.5 2.75L8 8 2.5 5.25Z M2.5 5.25V10.5L8 13.25V8 M8 8l5.5-2.75V10.5L8 13.25" />
      );
    case "warehouses":
      return (
        <path d="M2.5 13.25h11 M3.5 13.25V7.25L8 3.25l4.5 4v6 M6.75 13.25V9.5h2.5v3.75" />
      );
    case "purchases":
      return <path d="M4 2.25h8v11.5H4z M6 5.25h4 M6 8h4 M6 10.75h2.5" />;
    case "containers":
      return (
        <path d="M2.25 4.25h11.5v7.5H2.25z M2.25 7.25h11.5 M6 4.25v7.5 M10 4.25v7.5" />
      );
    case "movements":
      return (
        <path d="M2.75 5.75h8.5 M9.25 3.5 11.75 5.75 9.25 8 M13.25 10.25H4.75 M6.75 8 4.25 10.25 6.75 12.5" />
      );
    case "customers":
      return (
        <>
          <circle cx="8" cy="5.25" r="2" />
          <path d="M3.25 13c.7-2.4 2.4-3.5 4.75-3.5s4.05 1.1 4.75 3.5" />
        </>
      );
    case "suppliers":
      return (
        <>
          <path d="M2.25 10.5h11.5 M3.25 10.5V6h5.25v4.5 M8.5 10.5V7.75h2.5L12.5 9.4v1.1" />
          <circle cx="5" cy="12.15" r="0.9" />
          <circle cx="11.15" cy="12.15" r="0.9" />
        </>
      );
    case "sales":
      return (
        <path d="M3.5 2.25h6.1L12.5 5.1v8.65H3.5z M9.6 2.25V5.1H12.5 M6 8h3.5 M6 10.5h2.25" />
      );
    case "reports":
      return <path d="M3 13.25V8.25 M6.5 13.25V4.25 M10 13.25V6.5 M13.5 13.25V3" />;
    case "settings":
      return (
        <>
          <circle cx="8" cy="8" r="1.75" />
          <path d="M8 2v1.75 M8 12.25V14 M2 8h1.75 M12.25 8H14 M3.7 3.7l1.25 1.25 M11.05 11.05l1.25 1.25 M12.3 3.7l-1.25 1.25 M4.95 11.05 3.7 12.3" />
        </>
      );
    case "menu":
      return <path d="M2.5 4.25h11 M2.5 8h11 M2.5 11.75h11" />;
    case "close":
      return <path d="M4 4l8 8 M12 4 4 12" />;
    case "outbound":
      return <path d="M3 8h10 M10 4.75 13.25 8 10 11.25 M3 3.5h4 M3 12.5h4" />;
    case "transfers":
      return <path d="M2.75 5.25h8.5 M9 3.25 11.75 5.25 9 7.25 M13.25 10.75H4.75 M7 8.75 4.25 10.75 7 12.75" />;
    case "documents":
      return <path d="M4 2.25h5.2L12 5v8.75H4z M9.2 2.25V5H12 M6 8h4 M6 10.5h2.5" />;
    case "chat":
      return <path d="M3 3.5h10v7H6.5L3.5 13V3.5Z" />;
    case "users":
      return (
        <>
          <circle cx="6" cy="5.5" r="1.6" />
          <circle cx="10.5" cy="6" r="1.3" />
          <path d="M2.75 12.25c.5-1.8 1.8-2.7 3.25-2.7s2.75.9 3.25 2.7 M9.2 9.7c1.1.1 2 .7 2.5 2.55" />
        </>
      );
    case "bell":
      return <path d="M8 2.75a3.25 3.25 0 0 1 3.25 3.25v2.1l.9 1.65H3.85l.9-1.65v-2.1A3.25 3.25 0 0 1 8 2.75Z M6.6 12.4a1.4 1.4 0 0 0 2.8 0" />;
    case "offers":
      return (
        <>
          <path d="M2.5 4.5A1.5 1.5 0 0 1 4 3h8a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 11.5v-7Z" />
          <path d="M5.5 3v2 M10.5 3v2 M5.5 8.5h5" />
        </>
      );
    case "star":
      return (
        <path d="M8 2l1.8 3.65 4 .58-2.9 2.83.68 4L8 11.17l-3.58 1.89.68-4-2.9-2.83 4-.58L8 2Z" />
      );
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown icon ${exhaustive}`);
    }
  }
}
