import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RichText } from "@/components/ui/RichText";
import { RaceLanes } from "@/features/competitions/components/RaceLanes";
import { OutputConsole } from "@/features/playground/components/OutputConsole";
import { SubmissionResult } from "@/features/questions/components/SubmissionResult";
import type { ExecuteResponse, Participant, Submission } from "@/types/api";

describe("Button", () => {
  it("is disabled and busy while loading", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });
});

describe("Modal", () => {
  it("closes on Escape and labels the dialog", async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Delete snippet?" onClose={onClose}>
        body
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Delete snippet?" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores Escape while busy", async () => {
    const onClose = vi.fn();
    render(
      <Modal open busy title="Saving" onClose={onClose}>
        body
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("RichText", () => {
  it("renders markup as text, never as HTML", () => {
    const { container } = render(<RichText text={"Use `print()` and **bold**.\n\n<img src=x onerror=alert(1)>"} />);
    expect(container.querySelector("code")?.textContent).toBe("print()");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

const failed: ExecuteResponse = {
  status: "RUNTIME_ERROR",
  stdout: "before\n",
  stderr: 'Traceback (most recent call last):\n  File "main.py", line 2\nZeroDivisionError: division by zero\n',
  exit_code: 1,
  duration_ms: 31,
  truncated: false,
  error_type: "ZeroDivisionError",
  kill_reason: null,
  explanation: { title: "Division by zero", summary: "A number was divided by zero.", tips: ["Check the divisor."], line: 2 },
};

describe("OutputConsole", () => {
  it("shows stdout, the original traceback and the explanation together", () => {
    render(<OutputConsole phase="done" result={failed} error={null} />);
    expect(screen.getByText("Runtime error")).toBeInTheDocument();
    expect(screen.getByText(/ZeroDivisionError: division by zero/)).toBeInTheDocument();
    expect(screen.getByText("Division by zero")).toBeInTheDocument();
    expect(screen.getByText("Line 2")).toBeInTheDocument();
    expect(screen.getByText("31 ms")).toBeInTheDocument();
  });

  it("keeps the raw output and adds why the sandbox stopped the run", () => {
    render(
      <OutputConsole
        phase="done"
        result={{ ...failed, status: "TIMEOUT", stdout: "tick\n", stderr: "", kill_reason: "wall", explanation: null }}
        error={null}
      />,
    );
    expect(screen.getByText("tick")).toBeInTheDocument();
    expect(screen.getByText("Time limit")).toBeInTheDocument();
    expect(screen.getByText(/ran too long/)).toHaveAttribute("data-kill-reason", "wall");
  });

  it("shows no stop reason for a normal error", () => {
    const { container } = render(<OutputConsole phase="done" result={failed} error={null} />);
    expect(container.querySelector("[data-kill-reason]")).toBeNull();
  });

  it("shows network failures distinctly", () => {
    render(<OutputConsole phase="failed" result={null} error="Can't reach the server." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server.");
  });
});

describe("SubmissionResult", () => {
  const base: Submission = {
    id: 1, question_id: 1, competition_id: null, status: "WRONG_ANSWER", passed_count: 2, total_count: 7,
    feedback: null, created_at: "", judged_at: "", code: null,
  };

  it("shows example details for a failed public test", () => {
    render(
      <SubmissionResult
        submission={{ ...base, feedback: { is_public: true, input: "f(1)", expected: "2", actual: "3", message: "Failed example test 1 of 7." } }}
      />,
    );
    expect(screen.getByText("Wrong answer")).toBeInTheDocument();
    expect(screen.getByText("2 of 7 tests passed")).toBeInTheDocument();
    expect(screen.getByText("f(1)")).toBeInTheDocument();
  });

  it("shows only the message for a hidden test", () => {
    render(<SubmissionResult submission={{ ...base, feedback: { is_public: false, message: "Failed hidden test 5 of 7." } }} />);
    expect(screen.getByText("Failed hidden test 5 of 7.")).toBeInTheDocument();
    expect(screen.queryByText("Expected")).not.toBeInTheDocument();
  });
});

describe("RaceLanes", () => {
  const players: Participant[] = [
    { user_id: 1, username: "ada", is_host: true, is_ready: true, online: true, attempts: 2, has_pending: false },
    { user_id: 2, username: "linus", is_host: false, is_ready: true, online: false, attempts: 0, has_pending: false },
  ];

  it("draws one mark per attempt and crowns the winner", () => {
    const { container } = render(
      <RaceLanes
        participants={players}
        attempts={{ 1: ["WRONG_ANSWER", "ACCEPTED"] }}
        winner={{ user_id: 1, username: "ada", submission_id: 9, accepted_at: "", solve_seconds: 40 }}
        myUserId={2}
      />,
    );
    const lanes = container.querySelectorAll(".lane");
    expect(lanes[0].querySelectorAll(".lane__mark")).toHaveLength(2);
    expect(lanes[0].querySelector(".lane__mark--success")).not.toBeNull();
    expect(screen.getByLabelText("Winner")).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
    expect(screen.getByLabelText("Offline")).toBeInTheDocument();
  });
});
