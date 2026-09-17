import React from "react";
import { cn } from "@/lib/utils";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string | React.ReactNode;
  gridPosition: number;
  variant?: "purple" | "gray" | "red" | "green" | "blue" | "yellow" | "black";
}

const variantClasses = {
  purple: "bg-purple-700 hover:bg-purple-600 text-white",
  gray: "bg-gray-700 hover:bg-gray-600 text-white",
  red: "bg-red-700 hover:bg-red-600 text-white",
  green: "bg-green-600 hover:bg-green-500 text-white",
  blue: "bg-blue-700 hover:bg-blue-600 text-white",
  yellow: "bg-yellow-500 hover:bg-yellow-400 text-black",
  black: "bg-black hover:bg-gray-800 text-white",
};

export function MidiButton({
  label,
  gridPosition,
  variant = "gray",
  className,
  ...props
}: Props) {
  const handleClick = () => {
    console.log(`Button ${gridPosition} clicked`);
    // MIDI message generation will be handled here in a future step.
  };

  return (
    <button
      {...props}
      onClick={handleClick}
      className={cn(
        "w-full h-full rounded-lg flex items-center justify-center text-center text-xs font-bold p-1 leading-tight shadow-md transition-colors duration-150",
        variantClasses[variant],
        className
      )}
    >
      {label}
    </button>
  );
}
