import { GuideSteps } from "../components/journey";
import { MobileBack } from "../components/article";
import { Frame, MainSidebar } from "../components/shell";
import { useIsPhone } from "../lib/media";

/** The whole path in one place: what each stage gets you, what is left, and the shortcuts. */
export function GuidePage() {
  const phone = useIsPhone();
  return (
    <Frame sidebar={<MainSidebar />}>
      {phone && <MobileBack to="/" label="Today" />}
      <div className="flex justify-center px-4 pb-8 md:px-7 md:py-8">
        <div className="flex min-w-0 max-w-[760px] flex-1 flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 font-serif text-[28px] font-semibold md:text-[32px]">Guide</h1>
            <p className="m-0 max-w-[60ch] leading-[1.55] text-muted-foreground">
              RivetHub is useful from the first captured session. Each step below adds something on top, in the order most people want it.
            </p>
          </div>
          <GuideSteps />
        </div>
      </div>
    </Frame>
  );
}
