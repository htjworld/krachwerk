import { useI18n } from "../i18n/i18n";
import type { TraitSelection } from "../core";

interface Props {
  traits: TraitSelection;
  onChange: (traits: TraitSelection) => void;
}

export function TraitToggles({ traits, onChange }: Props) {
  const { t } = useI18n();

  return (
    <div className="trait-row" role="group" aria-label={t("seedScreen.traitsHeading")}>
      <button
        type="button"
        className="device-button"
        aria-pressed={traits.bassEmphasis}
        onClick={() => onChange({ ...traits, bassEmphasis: !traits.bassEmphasis })}
      >
        {t("traits.bassEmphasis")}
      </button>
      <button
        type="button"
        className="device-button"
        aria-pressed={traits.unusualTimbre}
        onClick={() => onChange({ ...traits, unusualTimbre: !traits.unusualTimbre })}
      >
        {t("traits.unusualTimbre")}
      </button>
      <button
        type="button"
        className="device-button"
        aria-pressed={traits.melodyStyle === "minimal"}
        onClick={() =>
          onChange({ ...traits, melodyStyle: traits.melodyStyle === "minimal" ? null : "minimal" })
        }
      >
        {t("traits.melodyMinimal")}
      </button>
      <button
        type="button"
        className="device-button"
        aria-pressed={traits.melodyStyle === "elaborate"}
        onClick={() =>
          onChange({ ...traits, melodyStyle: traits.melodyStyle === "elaborate" ? null : "elaborate" })
        }
      >
        {t("traits.melodyElaborate")}
      </button>
    </div>
  );
}
