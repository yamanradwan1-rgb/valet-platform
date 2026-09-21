import Image from "next/image";

export function VayletLogo({
  collapsed = false,
  tone = "light",
}: {
  readonly collapsed?: boolean;
  readonly tone?: "light" | "dark";
}) {
  return (
    <span className="vaylet-logo" aria-label="VAYLET">
      <Image
        alt=""
        aria-hidden="true"
        className="vaylet-logo-emblem"
        height={32}
        priority
        src="/vaylet-emblem.png"
        width={32}
      />
      {collapsed ? null : (
        <Image
          alt=""
          aria-hidden="true"
          className="vaylet-logo-wordmark"
          height={16}
          priority
          src={tone === "light" ? "/vaylet-text-white.png" : "/vaylet-text-dark.png"}
          width={108}
        />
      )}
    </span>
  );
}
