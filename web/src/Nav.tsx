import { useEffect, useRef, useState } from "react";

const PAGES = [
  { href: "/", label: "Songs" },
  { href: "#", label: "Bible Memorization" },
  { href: "#knowledge", label: "Knowledge Library" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="nav-dropdown" ref={ref}>
      <button className="btn btn-outline" onClick={() => setOpen((o) => !o)}>
        Pages &#9662;
      </button>
      {open && (
        <div className="nav-dropdown-menu">
          {PAGES.map((p) => (
            <a key={p.label} href={p.href} onClick={() => setOpen(false)}>
              {p.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
