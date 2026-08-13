import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "go" | "ghost" | "danger" | "gold" | "mint";
};

const variants: Record<NonNullable<Props["variant"]>, string> = {
  go: "bg-gradient-to-b from-[#7dffb0] to-[#2fd7a4] text-[#062016] shadow-[0_6px_0_#148a68,0_12px_28px_rgba(125,255,176,0.25)]",
  gold: "bg-gradient-to-b from-[#ffe08a] to-[#ffb347] text-[#3a2208] shadow-[0_6px_0_#c47a18,0_12px_28px_rgba(255,211,106,0.28)]",
  mint: "bg-gradient-to-b from-[#9bf6ff] to-[#5cefff] text-[#062430] shadow-[0_6px_0_#1a8aa0,0_12px_28px_rgba(92,239,255,0.28)]",
  danger:
    "bg-gradient-to-b from-[#ff8ec4] to-[#ff5aa8] text-[#3a0520] shadow-[0_6px_0_#b0206a,0_12px_28px_rgba(255,90,168,0.28)]",
  ghost:
    "bg-white/8 text-cream shadow-[0_5px_0_rgba(255,255,255,0.08)] ring-1 ring-white/15",
};

export default function Pressable({
  children,
  variant = "go",
  className = "",
  disabled,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`pressable relative select-none rounded-full px-5 py-3.5 text-center text-[15px] font-extrabold tracking-wide transition-transform duration-150 ease-out active:translate-y-[5px] active:shadow-none disabled:opacity-40 disabled:active:translate-y-0 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
