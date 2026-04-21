from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CurrentDriver:
    abbreviation: str
    full_name: str
    driver_number: str
    team: str
    is_rookie: int = 0
    previous_team: str | None = None
    baseline_grid: float = 11.5
    championship_points: float = 0.0


CURRENT_LINEUPS: dict[int, list[CurrentDriver]] = {
    2026: [
        CurrentDriver("RUS", "George Russell", "63", "Mercedes", baseline_grid=2.5, championship_points=63),
        CurrentDriver("ANT", "Kimi Antonelli", "12", "Mercedes", baseline_grid=2.0, championship_points=72),
        CurrentDriver("LEC", "Charles Leclerc", "16", "Ferrari", baseline_grid=3.5, championship_points=49),
        CurrentDriver("HAM", "Lewis Hamilton", "44", "Ferrari", baseline_grid=4.5, championship_points=41),
        CurrentDriver("NOR", "Lando Norris", "1", "McLaren", baseline_grid=5.0, championship_points=25),
        CurrentDriver("PIA", "Oscar Piastri", "81", "McLaren", baseline_grid=5.5, championship_points=21),
        CurrentDriver("OCO", "Esteban Ocon", "31", "Haas F1 Team", baseline_grid=13.5, championship_points=1),
        CurrentDriver("BEA", "Oliver Bearman", "87", "Haas F1 Team", baseline_grid=8.5, championship_points=17),
        CurrentDriver("GAS", "Pierre Gasly", "10", "Alpine", baseline_grid=9.5, championship_points=15),
        CurrentDriver("COL", "Franco Colapinto", "43", "Alpine", baseline_grid=14.5, championship_points=1),
        CurrentDriver("VER", "Max Verstappen", "3", "Red Bull Racing", baseline_grid=7.0, championship_points=12),
        CurrentDriver("HAD", "Isack Hadjar", "6", "Red Bull Racing", baseline_grid=10.5, championship_points=4),
        CurrentDriver("LAW", "Liam Lawson", "30", "Racing Bulls", previous_team="RB", baseline_grid=10.0, championship_points=10),
        CurrentDriver("LIN", "Arvid Lindblad", "41", "Racing Bulls", is_rookie=1, previous_team="RB", baseline_grid=12.0, championship_points=4),
        CurrentDriver("HUL", "Nico Hulkenberg", "27", "Audi", previous_team="Kick Sauber", baseline_grid=16.5, championship_points=0),
        CurrentDriver("BOR", "Gabriel Bortoleto", "5", "Audi", previous_team="Kick Sauber", baseline_grid=12.5, championship_points=2),
        CurrentDriver("SAI", "Carlos Sainz", "55", "Williams", baseline_grid=13.0, championship_points=2),
        CurrentDriver("ALB", "Alexander Albon", "23", "Williams", baseline_grid=17.0, championship_points=0),
        CurrentDriver("PER", "Sergio Perez", "11", "Cadillac", previous_team="Red Bull Racing", baseline_grid=19.0, championship_points=0),
        CurrentDriver("BOT", "Valtteri Bottas", "77", "Cadillac", previous_team="Kick Sauber", baseline_grid=18.0, championship_points=0),
        CurrentDriver("ALO", "Fernando Alonso", "14", "Aston Martin", baseline_grid=20.0, championship_points=0),
        CurrentDriver("STR", "Lance Stroll", "18", "Aston Martin", baseline_grid=21.0, championship_points=0),
    ]
}


TEAM_ALIASES: dict[str, list[str]] = {
    "Audi": ["Audi", "Kick Sauber", "Sauber", "Stake F1 Team Kick Sauber"],
    "Racing Bulls": ["Racing Bulls", "RB", "Visa Cash App RB"],
    "Cadillac": ["Cadillac", "Red Bull Racing", "Kick Sauber"],
}


def current_lineup_for_season(season: int) -> list[CurrentDriver]:
    if season in CURRENT_LINEUPS:
        return CURRENT_LINEUPS[season]
    if season > 2026:
        return CURRENT_LINEUPS[2026]
    return []


def team_aliases(team: str | None) -> list[str]:
    if not team:
        return []
    return TEAM_ALIASES.get(team, [team])
