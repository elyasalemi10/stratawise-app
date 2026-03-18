"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src?: string | null;
  initials: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function UserAvatar({ src, initials, size = "default", className }: UserAvatarProps) {
  return (
    <Avatar size={size} className={cn(className)}>
      {src ? <AvatarImage src={src} alt="Avatar" /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
