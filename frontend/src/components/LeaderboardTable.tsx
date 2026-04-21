import type { LeaderboardRow } from "../types/f1";

type Props = {
  rows: LeaderboardRow[];
  lap?: number;
  selectedDriver?: string;
  onSelectDriver: (driver: string) => void;
};

export function LeaderboardTable({ rows, lap, selectedDriver, onSelectDriver }: Props) {
  const activeLap = lap ?? rows[0]?.lap_number ?? 1;
  const isFrameSynced = rows.length <= 30 && new Set(rows.map((row) => row.driver)).size === rows.length;
  const visible = (isFrameSynced ? rows : rows.filter((row) => row.lap_number === activeLap))
    .sort((a, b) => a.position - b.position)
    .slice(0, 20);

  return (
    <div className="panel">
      <div className="panelHeader">
        <h2>Leaderboard</h2>
        <span>Lap {activeLap}</span>
      </div>
      <div className="tableShell">
        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Driver</th>
              <th>Gap</th>
              <th>Tire</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={`${row.lap_number}-${row.driver}`}
                className={row.driver === selectedDriver ? "selectedRow" : ""}
                onClick={() => onSelectDriver(row.driver)}
              >
                <td>{row.position}</td>
                <td>{row.driver}</td>
                <td>{row.gap_to_leader ? `+${row.gap_to_leader.toFixed(1)}` : row.position === 1 ? "Leader" : "--"}</td>
                <td>{row.compound ?? "Unknown"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
