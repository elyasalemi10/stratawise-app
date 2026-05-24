// Curated Lucide icons for the blog timeline, as raw SVG strings (from
// lucide-static , plain strings, safe to import on both server and client).
// Shared by the editor's timeline node view and the AI-import HTML builder.
import {
  Rocket, TrendingUp, CircleCheck, Wrench, Lightbulb, Building2, Calendar, Lock, Star,
  Users, FileText, Award, Target, Zap, Flag, Clock, Heart, ShieldCheck, ChartColumn,
  DollarSign, Mail, Phone, MapPin, House, Briefcase, Megaphone, Sparkles, ThumbsUp,
  Handshake, Globe, Bell, BookOpen, Coins, CreditCard, Gauge, Gift, GraduationCap,
  Key, Leaf, Package, PenTool, Scale, Search, Settings, Smile, Trophy, Truck, Wallet,
} from "lucide-static";

export const ICON_SVG: Record<string, string> = {
  Rocket, TrendingUp, CircleCheck, Wrench, Lightbulb, Building2, Calendar, Lock, Star,
  Users, FileText, Award, Target, Zap, Flag, Clock, Heart, ShieldCheck, ChartColumn,
  DollarSign, Mail, Phone, MapPin, House, Briefcase, Megaphone, Sparkles, ThumbsUp,
  Handshake, Globe, Bell, BookOpen, Coins, CreditCard, Gauge, Gift, GraduationCap,
  Key, Leaf, Package, PenTool, Scale, Search, Settings, Smile, Trophy, Truck, Wallet,
};

export const ICON_NAMES = Object.keys(ICON_SVG);

export function iconDataUri(name: string): string {
  const svg = ICON_SVG[name] ?? ICON_SVG.Rocket;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
