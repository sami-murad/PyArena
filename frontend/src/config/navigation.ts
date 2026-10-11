import type { LucideIcon } from "lucide-react";
import { BookOpenCheck, FileCode2, SquareTerminal, Swords } from "lucide-react";

import { features, type FeatureFlag } from "@/config/features";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  requiresAuth?: boolean;
  feature?: FeatureFlag;
}

export const routes = {
  home: "/",
  playground: "/playground",
  questions: "/questions",
  question: (id: number | string) => `/questions/${id}`,
  competitions: "/competitions",
  competition: (id: number | string) => `/competitions/${id}`,
  join: (code: string) => `/join/${code}`,
  snippets: "/snippets",
  profile: "/profile",
  login: "/login",
  register: "/register",
  about: "/about",
} as const;

const allNavigation: NavItem[] = [
  { label: "Playground", to: routes.playground, icon: SquareTerminal },
  { label: "Questions", to: routes.questions, icon: BookOpenCheck },
  { label: "Competitions", to: routes.competitions, icon: Swords, feature: "competitions" },
  { label: "Snippets", to: routes.snippets, icon: FileCode2, requiresAuth: true, feature: "snippets" },
];

export const primaryNavigation = allNavigation.filter((item) => !item.feature || features[item.feature]);

export const footerNavigation = [
  { label: "About", to: routes.about },
  { label: "Playground", to: routes.playground },
  { label: "Questions", to: routes.questions },
];
