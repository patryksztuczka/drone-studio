import { realStatus } from "@drone-studio/engine-client";
import { Dot } from "@drone-studio/ui/components/pill";
import {
  CardBody,
  CardHeader,
  CardRow,
  SchematicCard,
} from "@drone-studio/ui/components/schematic-card";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

export const RealCard = () => {
  const status = useAtomValue(realStatus);
  const value = AsyncResult.isSuccess(status) ? status.value : undefined;

  return (
    <SchematicCard aria-label="Real hardware" className="w-[300px] border-ok">
      <CardHeader
        title={<span className="text-ok">Real · read-only</span>}
        aside={
          <span className="flex items-center gap-1.5">
            <Dot tone={value?.connected === true ? "ok" : "faint"} />
            {value?.connected === true ? "connected" : "no board"}
          </span>
        }
      />
      <CardBody>
        <CardRow label="policy">{value?.policy ?? "read-only"}</CardRow>
        <CardRow label="motors">
          <span className="text-fail">blocked until M2</span>
        </CardRow>
        <p className="font-sans text-[12px] leading-[17px] text-muted">
          {value?.detail ??
            "Studio only reads telemetry from a real board and never sends it commands."}
        </p>
      </CardBody>
    </SchematicCard>
  );
};
