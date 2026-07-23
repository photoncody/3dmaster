"use client";

import {
  canOpenInBambuStudio,
} from "@/features/models/adapters/bambu-studio";
import {
  sendToSlicer,
  type SlicerHandoffContext,
} from "@/features/models/slicer-handoff";

type Props = {
  ctx: SlicerHandoffContext;
  className?: string;
  onError?: (message: string) => void;
};

export function OpenInBambuStudioButton({
  ctx,
  className = "btn secondary sm",
  onError,
}: Props) {
  if (!canOpenInBambuStudio(ctx.filename)) return null;

  return (
    <button
      type="button"
      className={className}
      title="Open this file in Bambu Studio on this computer"
      onClick={() => {
        void sendToSlicer("bambu-studio", ctx).catch((err: unknown) => {
          onError?.(
            err instanceof Error
              ? err.message
              : "Failed to open in Bambu Studio",
          );
        });
      }}
    >
      Open in Bambu Studio
    </button>
  );
}
