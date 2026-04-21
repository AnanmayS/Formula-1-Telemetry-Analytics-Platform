import type { PredictionCardData } from "../types/f1";

type Props = {
  prediction: PredictionCardData;
};

export function PredictionCard({ prediction }: Props) {
  const label = prediction.predicted_class > 0 ? "Gain" : prediction.predicted_class < 0 ? "Lose" : "Flat";
  return (
    <article className="predictionCard">
      <div>
        <h3>
          P{prediction.predicted_finishing_position ?? "--"} · {prediction.driver}
        </h3>
        <p>{prediction.team ?? "Independent entry"}</p>
      </div>
      <strong className={prediction.predicted_class > 0 ? "good" : prediction.predicted_class < 0 ? "bad" : "flat"}>{label}</strong>
      <dl>
        <div>
          <dt>Start</dt>
          <dd>{prediction.starting_position ?? "--"}</dd>
        </div>
        <div>
          <dt>Predicted finish</dt>
          <dd>{prediction.predicted_finishing_position ?? "--"}</dd>
        </div>
        <div>
          <dt>Net places</dt>
          <dd>{formatDelta(prediction.predicted_position_delta)}</dd>
        </div>
        <div>
          <dt>Gain prob</dt>
          <dd>{Math.round(prediction.probability_gain * 100)}%</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{Math.round(prediction.confidence * 100)}%</dd>
        </div>
      </dl>
      <ul>
        {prediction.top_contributing_features.slice(0, 3).map((feature) => (
          <li key={feature.feature}>{feature.feature}</li>
        ))}
      </ul>
    </article>
  );
}

function formatDelta(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}
