export const UCT_ENDPOINTS = {
  // Football
  "football-sorare":     `${process.env.UCT_BASE_URL}/uct-fb-sr/football-sorare/teams`,
  "football-fanduel":    `${process.env.UCT_BASE_URL}/uct-fb-fd/football-fanduel/teams`,
  "football-draftkings": `${process.env.UCT_BASE_URL}/uct-fb-dk/football-draftkings/teams`,
  "football-football":   `${process.env.UCT_BASE_URL}/football/teams`,

  // Cricket (future)
  "cricket-sorare":      `${process.env.UCT_BASE_URL}/uct-cr-sr/cricket-sorare/teams`,
  "cricket-fanduel":     `${process.env.UCT_BASE_URL}/uct-cr-fd/cricket-fanduel/teams`,
  "cricket-draftkings":  `${process.env.UCT_BASE_URL}/uct-cr-dk/cricket-draftkings/teams`,
  "cricket-cricket":     `${process.env.UCT_BASE_URL}/cricket/teams`,

  // Fallback
  "sorare":     `${process.env.UCT_BASE_URL}/uct-fb-sr/football-sorare/teams`,
  "fanduel":    `${process.env.UCT_BASE_URL}/uct-fb-fd/football-fanduel/teams`,
  "draftkings": `${process.env.UCT_BASE_URL}/uct-fb-dk/football-draftkings/teams`,
  "football":   `${process.env.UCT_BASE_URL}/football/teams`,
};

export const getUCTEndpoint = (game, sport = "football") => {
  const g = String(game  || "football").toLowerCase().trim();
  const s = String(sport || "football").toLowerCase().trim();

  // sport+game combination key
  const combinedKey = `${s}-${g}`;
  if (UCT_ENDPOINTS[combinedKey]) return UCT_ENDPOINTS[combinedKey];

  // fallback to game only
  return UCT_ENDPOINTS[g] || UCT_ENDPOINTS["football"];
};

export const getValidSportsAndGames = () => {
  const endpointKeys = Object.keys(UCT_ENDPOINTS).filter((key) => key.includes("-"));
  const sports = [...new Set(endpointKeys.map((key) => key.split("-")[0]))];
  const games  = [...new Set(endpointKeys.map((key) => key.split("-")[1]))];
  return { sports, games };
};