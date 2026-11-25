import { isValidElement, type ReactNode } from "react";

import type { HubRecord } from "../src/hub/records";
import { HubSheet } from "../src/screens/HubSheet";

const mockHub = jest.fn();

jest.mock("../src/hub/HubContext", () => ({ useHub: () => mockHub() }));
jest.mock("../src/theme/Theme", () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => "#000" }) }),
}));
jest.mock("../src/nav/ref", () => ({ navigationRef: { isReady: () => false, navigate: jest.fn() } }));
jest.mock("../src/ui/chrome", () => ({ Sheet: () => null }));

const hub = (name: string): HubRecord => ({ id: name, name, url: `https://${name}.example:5174` }) as HubRecord;
const HUBS = [hub("alpha"), hub("bravo"), hub("charlie")];
const PENDING = { url: "https://new.example:5174", name: "newhub" };

function texts(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (isValidElement<{ children?: ReactNode }>(node)) return texts(node.props.children);
  return [];
}

function renderSheet(state: object) {
  mockHub.mockReturnValue({
    hubs: HUBS,
    current: HUBS[0],
    pairError: null,
    pendingPair: null,
    confirmPendingPair: jest.fn(),
    cancelPendingPair: jest.fn(),
    setOpen: jest.fn(),
    selectHub: jest.fn(),
    ...state,
  });
  return texts(HubSheet()).join("|");
}

describe("HubSheet", () => {
  it("shows the hub list and settings rows when no pair is pending", () => {
    const out = renderSheet({});
    for (const label of ["alpha", "bravo", "charlie", "+ Connect to a hub…", "Stats", "Appearance"]) expect(out).toContain(label);
  });

  it("shows only the confirmation card while a pair is pending, so it fits a small phone", () => {
    const out = renderSheet({ pendingPair: PENDING });
    expect(out).toContain("Connect to newhub?");
    expect(out).toContain("Connect");
    expect(out).toContain("Cancel");
    for (const label of ["alpha", "bravo", "charlie", "+ Connect to a hub…", "Stats", "Shared", "Guide", "Connections", "Appearance"]) {
      expect(out).not.toContain(label);
    }
  });

  it("keeps a save error visible beside the pending card", () => {
    expect(renderSheet({ pendingPair: PENDING, pairError: "Name the hub." })).toContain("Name the hub.");
  });
});
