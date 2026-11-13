import { useReducer } from "react";
import { useShareClient } from "../client/context";
import { describeFailure } from "../share/failure";
import { importChoices, initialReceive, receiveReducer } from "../share/receiveModel";
import { Imported, Paste, Report } from "../share/receive";
import { FailureNote, ShareScreen } from "../share/ui";

const STEPS = ["Paste the code", "Review", "Imported"] as const;
const AT = { paste: 0, checking: 0, report: 1, importing: 1, imported: 2 } as const;

export function ReceivePage() {
  const share = useShareClient();
  const [state, dispatch] = useReducer(receiveReducer, initialReceive);
  const failed = (error: unknown) => dispatch({ type: "fail", failure: describeFailure(error, "receive") });
  const check = () => {
    if (!share) return;
    dispatch({ type: "check" });
    share.receive(state.code.trim()).then((report) => dispatch({ type: "report", report }), failed);
  };
  const run = () => {
    if (!share || !state.report) return;
    dispatch({ type: "import" });
    share.importReceived(state.code.trim(), { choices: importChoices(state.report, state.choices) }).then((result) => dispatch({ type: "imported", result }), failed);
  };
  return (
    <ShareScreen title="Receive sessions" lead="Enter the code you were sent. RivetHub downloads the bundle, checks it, and imports only what you decide." steps={STEPS} current={AT[state.step]}>
      {state.failure && <FailureNote failure={state.failure} onDismiss={() => dispatch({ type: "dismiss" })} />}
      {(state.step === "paste" || state.step === "checking") && <Paste code={state.code} busy={state.step === "checking"} onCode={(code) => dispatch({ type: "code", code })} onCheck={check} />}
      {(state.step === "report" || state.step === "importing") && state.report && (
        <Report state={state} busy={state.step === "importing"} onChoose={(n, decision) => dispatch({ type: "choose", n, decision })} onImport={run} onCancel={() => dispatch({ type: "reset" })} onTrusted={() => {}} />
      )}
      {state.step === "imported" && state.report && state.result && <Imported state={state} onDone={() => dispatch({ type: "reset" })} />}
    </ShareScreen>
  );
}
