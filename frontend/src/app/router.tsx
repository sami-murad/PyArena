import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";

import { MainLayout } from "@/components/layout/MainLayout";
import { PageSpinner } from "@/components/ui/Spinner";
import { features } from "@/config/features";
import { RequireAuth } from "@/features/auth/components/RequireAuth";
import HomePage from "@/features/home/HomePage";

const PlaygroundPage = lazy(() => import("@/features/playground/PlaygroundPage"));
const QuestionsPage = lazy(() => import("@/features/questions/QuestionsPage"));
const QuestionPage = lazy(() => import("@/features/questions/QuestionPage"));
const CompetitionsPage = lazy(() => import("@/features/competitions/CompetitionsPage"));
const RoomPage = lazy(() => import("@/features/competitions/RoomPage"));
const JoinPage = lazy(() => import("@/features/competitions/JoinPage"));
const SnippetsPage = lazy(() => import("@/features/snippets/SnippetsPage"));
const ProfilePage = lazy(() => import("@/features/profile/ProfilePage"));
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/features/auth/RegisterPage"));
const AboutPage = lazy(() => import("@/features/about/AboutPage"));
const NotFoundPage = lazy(() => import("@/app/NotFoundPage"));

const page = (node: ReactNode) => <Suspense fallback={<PageSpinner />}>{node}</Suspense>;
const authed = (node: ReactNode) => page(<RequireAuth>{node}</RequireAuth>);

export const router = createBrowserRouter([
  {
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage />, handle: { marketing: true } },
      { path: "playground", element: page(<PlaygroundPage />), handle: { workspace: true } },
      { path: "questions", element: page(<QuestionsPage />) },
      { path: "questions/:questionId", element: page(<QuestionPage />), handle: { workspace: true } },
      ...(features.competitions
        ? [
            { path: "competitions", element: authed(<CompetitionsPage />) },
            { path: "competitions/:competitionId", element: authed(<RoomPage />), handle: { workspace: true } },
            { path: "join/:code", element: authed(<JoinPage />) },
          ]
        : []),
      ...(features.snippets ? [{ path: "snippets", element: authed(<SnippetsPage />) }] : []),
      { path: "profile", element: authed(<ProfilePage />) },
      { path: "login", element: page(<LoginPage />) },
      { path: "register", element: page(<RegisterPage />) },
      { path: "about", element: page(<AboutPage />), handle: { marketing: true } },
      { path: "*", element: page(<NotFoundPage />) },
    ],
  },
]);
